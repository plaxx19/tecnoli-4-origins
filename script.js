// Importaciones nativas desde CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ------------------------------------------------------------------
// 1. Configuración de Supabase
// ------------------------------------------------------------------
const SUPABASE_URL = "https://ibfkdbuahvbzhoqigeii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RUq18PkAFzxMwUqzdmdamg_qQb2j6ky";

const isSupabaseConfigured = 
  SUPABASE_URL !== 'HTTPS://TU-PROYECTO.supabase.co' && 
  SUPABASE_ANON_KEY !== 'TU_SUPABASE_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------------
// 2. Estado Global de la Aplicación
// ------------------------------------------------------------------
const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
});

let products = [];
let allSales = [];
const cart = new Map();
const builderSetup = new Map();

let scene3D, camera3D, renderer3D, caseMesh;
const installed3DMeshes = new Map();

const SLOT_CONFIG_3D = {
  'Motherboard':     { pos: [0, 0.1, -0.2],   size: [0.1, 3.0, 3.0], color: 0x10b981 },
  'GPU':             { pos: [0.3, -0.3, 0.2],  size: [0.8, 0.8, 2.3], color: 0xef4444 },
  'RAM':             { pos: [0.2, 0.7, -0.4],  size: [0.1, 0.8, 0.2], color: 0xf59e0b },
  'fuente de poder': { pos: [0, -1.4, 0],      size: [1.6, 0.8, 1.6], color: 0x6366f1 },
  'almacenamiento':  { pos: [-0.6, -1.1, 1.1], size: [0.6, 0.2, 1.0], color: 0x06b6d4 },
  'gabinete':        { pos: [0, 0, 0],         size: [2.1, 4.1, 4.1], color: 0x3b82f6 },
  'refrigeracion':   { pos: [0, 1.5, -0.2],    size: [0.8, 0.5, 2.5], color: 0x38bdf8 }
};

// ------------------------------------------------------------------
// 3. Funciones Auxiliares
// ------------------------------------------------------------------
function getStatusMessage() {
  return document.querySelector('#status-message');
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function normalizeText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatDate(isoString) {
  if (!isoString) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(isoString));
}

function productImage(product) {
  const url = product.image_url || 'https://placehold.co/500x350?text=Tecnoli';
  const displayName = `${product.marca} ${product.modelo}`;
  return `<img class="product-image" src="${escapeHTML(url)}" alt="${escapeHTML(displayName)}" loading="lazy" onerror="this.src='https://placehold.co/500x350?text=Producto'">`;
}

function badgeClass(badge) {
  const value = String(badge || '').toLowerCase();
  if (value.includes('nuevo')) return 'cyan';
  if (value.includes('oferta')) return 'orange';
  if (value.includes('premium')) return 'navy';
  return 'yellow';
}

// ------------------------------------------------------------------
// 4. Renderizado 3D (Three.js)
// ------------------------------------------------------------------
function init3DCase(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const width = container.clientWidth || 340;
  const height = container.clientHeight || 220;

  scene3D = new THREE.Scene();
  camera3D = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  renderer3D = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  
  renderer3D.setSize(width, height);
  container.innerHTML = '';
  container.appendChild(renderer3D.domElement);

  scene3D.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0x0874ed, 1.8);
  sun.position.set(5, 10, 7);
  scene3D.add(sun);

  const caseGeo = new THREE.BoxGeometry(2.2, 4.2, 4.2);
  const caseMat = new THREE.MeshStandardMaterial({ 
    color: 0x0874ed, 
    wireframe: true, 
    transparent: true, 
    opacity: 0.4 
  });
  caseMesh = new THREE.Mesh(caseGeo, caseMat);
  scene3D.add(caseMesh);

  camera3D.position.set(5, 3, 6);
  camera3D.lookAt(0, 0, 0);

  function animate() {
    requestAnimationFrame(animate);
    if (caseMesh) caseMesh.rotation.y += 0.003;
    installed3DMeshes.forEach(mesh => {
      mesh.rotation.y += 0.003;
    });
    renderer3D.render(scene3D, camera3D);
  }
  animate();
}

function update3DPiece(slotType, isInstalled) {
  if (!scene3D) return;

  const config = SLOT_CONFIG_3D[slotType];
  if (!config) return;

  if (installed3DMeshes.has(slotType)) {
    scene3D.remove(installed3DMeshes.get(slotType));
    installed3DMeshes.delete(slotType);
  }

  if (isInstalled) {
    const geo = new THREE.BoxGeometry(...config.size);
    const mat = new THREE.MeshStandardMaterial({ 
      color: config.color, 
      roughness: 0.3,
      metalness: 0.7 
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...config.pos);

    scene3D.add(mesh);
    installed3DMeshes.set(slotType, mesh);
  }
}

// ------------------------------------------------------------------
// 5. Renderizado del Catálogo de Productos
// ------------------------------------------------------------------
function renderBestSeller(product) {
  const displayName = `${product.marca} ${product.modelo}`;
  const badge = product.badge
    ? `<span class="badge ${badgeClass(product.badge)}">${escapeHTML(product.badge)}</span>`
    : '';
  return `
    <article class="product-card best-card" draggable="true" data-drag-id="${escapeHTML(product.id_componente)}">
      ${badge}
      ${productImage(product)}
      <h3 class="product-name">${escapeHTML(displayName)}</h3>
      <p class="product-price">${money.format(Number(product.precio) || 0)} MXN</p>
      <button class="add-button" data-add="${escapeHTML(product.id_componente)}" type="button">🛒 &nbsp; Agregar</button>
    </article>`;
}

function renderMiniProduct(product) {
  const displayName = `${product.marca} ${product.modelo}`;
  return `
    <article class="product-card mini-card" draggable="true" data-drag-id="${escapeHTML(product.id_componente)}">
      ${productImage(product)}
      <h3 class="product-name">${escapeHTML(displayName)}</h3>
      <p class="product-price">${money.format(Number(product.precio) || 0)} MXN</p>
      <button class="add-button mini-add" data-add="${escapeHTML(product.id_componente)}" type="button">Agregar</button>
    </article>`;
}

function renderProducts(list) {
  const bestContainer = document.querySelector('#best-products');
  if (!bestContainer) return;

  const best = list.filter(p => p.best_seller || p.badge).slice(0, 5);
  const fallbackBest = best.length ? best : list.slice(0, 5);
  
  bestContainer.innerHTML = fallbackBest.length
    ? fallbackBest.map(renderBestSeller).join('')
    : `<p class="empty-cart">No hay componentes disponibles.</p>`;

  document.querySelectorAll('.mini-grid').forEach(grid => {
    const rawCategory = grid.dataset.category;
    const categoryTarget = normalizeText(rawCategory);

    const categoryProducts = list.filter(p => normalizeText(p.tipo) === categoryTarget).slice(0, 3);

    grid.innerHTML = categoryProducts.length
      ? categoryProducts.map(renderMiniProduct).join('')
      : `<p class="empty-cart">Sin componentes de este tipo</p>`;
  });
}

// ------------------------------------------------------------------
// 6. Carga de Datos desde Supabase
// ------------------------------------------------------------------
async function loadProducts() {
  const statusEl = getStatusMessage();
  if (statusEl) statusEl.textContent = 'Cargando catálogo desde Supabase…';

  if (!isSupabaseConfigured) {
    if (statusEl) statusEl.textContent = 'Por favor ingresa tus credenciales SUPABASE_URL y SUPABASE_ANON_KEY en script.js.';
    renderProducts([]);
    return;
  }

  try {
    const { data, error } = await supabase
      .from('componentes')
      .select('*')
      .eq('activo', true)
      .gt('stock', 0)
      .order('marca');

    if (error) throw error;

    products = data || [];
    if (statusEl) {
      statusEl.textContent = products.length 
        ? `Catálogo cargado (${products.length} componentes disponibles).` 
        : 'No hay componentes activos en el inventario.';
    }
    renderProducts(products);
  } catch (err) {
    console.error('Error al conectar con Supabase:', err);
    if (statusEl) statusEl.textContent = 'Error al obtener datos de Supabase. Revisa la consola y las políticas RLS.';
    renderProducts([]);
  }
}

// ------------------------------------------------------------------
// 7. Manejo del Carrito de Compras y Registro de Venta
// ------------------------------------------------------------------
function addToCart(productId) {
  const product = products.find(p => String(p.id_componente) === String(productId));
  if (!product) return;
  
  const key = String(product.id_componente);
  const current = cart.get(key);
  const currentQty = current?.quantity || 0;

  if (currentQty + 1 > product.stock) {
    alert(`Solo hay ${product.stock} unidades disponibles en stock de este componente.`);
    return;
  }

  cart.set(key, { product, quantity: currentQty + 1 });
  updateCartUI();
}

function removeFromCart(productId) {
  const key = String(productId);
  const current = cart.get(key);
  if (!current) return;

  if (current.quantity > 1) {
    cart.set(key, { product: current.product, quantity: current.quantity - 1 });
  } else {
    cart.delete(key);
  }
  updateCartUI();
}

window.removeFromCart = removeFromCart;

function updateCartUI() {
  const entries = [...cart.values()];
  const quantity = entries.reduce((sum, item) => sum + item.quantity, 0);
  const total = entries.reduce((sum, item) => sum + Number(item.product.precio) * item.quantity, 0);

  const countEl = document.querySelector('#cart-count');
  const totalEl = document.querySelector('#cart-total');
  const dialogTotalEl = document.querySelector('#dialog-total');
  const itemsEl = document.querySelector('#cart-items');

  if (countEl) countEl.textContent = quantity;
  if (totalEl) totalEl.textContent = money.format(total);
  if (dialogTotalEl) dialogTotalEl.textContent = money.format(total);
  
  if (itemsEl) {
    itemsEl.innerHTML = entries.length
      ? entries.map(({ product, quantity: qty }) => {
          const displayName = `${product.marca} ${product.modelo}`;
          return `
            <div class="cart-line" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <span>
                ${escapeHTML(displayName)}
                <small style="display:block;">Cantidad: ${qty} × ${money.format(product.precio)}</small>
              </span>
              <div style="display:flex; align-items:center; gap:8px;">
                <strong>${money.format(Number(product.precio) * qty)}</strong>
                <button type="button" onclick="removeFromCart('${product.id_componente}')" style="background:#fee2e2; color:#b91c1c; border:0; border-radius:4px; padding:2px 6px; cursor:pointer; font-weight:bold;">−</button>
              </div>
            </div>`;
        }).join('')
      : `<p class="empty-cart">Tu carrito está vacío.</p>`;
  }
}

async function resolveOrCreateUsuario({ correo, nombre, numero_tel, direccion }) {
  const { data: existingUser, error: findError } = await supabase
    .from('usuarios')
    .select('id_usuario')
    .eq('correo', correo)
    .maybeSingle();

  if (findError) throw findError;
  if (existingUser) return existingUser.id_usuario;

  const numCliente = `CLI-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
  const { data: newUser, error: insertError } = await supabase
    .from('usuarios')
    .insert({
      num_cliente: numCliente,
      nombre,
      correo,
      numero_tel: numero_tel || null,
      password_hash: 'GUEST_CHECKOUT_' + crypto.randomUUID(),
      direccion: direccion || null
    })
    .select('id_usuario')
    .single();

  if (insertError) throw insertError;
  return newUser.id_usuario;
}

async function handleRegisterSale(event) {
  event.preventDefault();
  const feedbackEl = document.querySelector('#sale-feedback');
  const submitBtn = document.querySelector('#register-sale-btn');

  if (cart.size === 0) {
    if (feedbackEl) {
      feedbackEl.style.color = '#dc2626';
      feedbackEl.textContent = 'Agrega al menos un componente al carrito antes de registrar la venta.';
    }
    return;
  }

  const correo = document.querySelector('#sale-email').value.trim();
  const nombre = document.querySelector('#sale-name').value.trim();
  const numero_tel = document.querySelector('#sale-phone').value.trim();
  const direccion = document.querySelector('#sale-address').value.trim();
  const estado = document.querySelector('#sale-status').value;

  const entries = [...cart.values()];
  const total = entries.reduce((sum, item) => sum + Number(item.product.precio) * item.quantity, 0);
  const folioVenta = `VTA-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando venta...';
    if (feedbackEl) {
      feedbackEl.style.color = '#0869e8';
      feedbackEl.textContent = 'Procesando operación en Supabase...';
    }

    const idUsuario = await resolveOrCreateUsuario({ correo, nombre, numero_tel, direccion });

    const { data: venta, error: ventaError } = await supabase
      .from('ventas')
      .insert({
        id_usuario: idUsuario,
        folio_venta: folioVenta,
        total,
        estado
      })
      .select('id_venta, folio_venta')
      .single();

    if (ventaError) throw ventaError;

    for (const { product, quantity } of entries) {
      const { data: detalle, error: detalleError } = await supabase
        .from('detalle_venta')
        .insert({
          id_venta: venta.id_venta,
          id_componente: product.id_componente,
          cantidad: quantity,
          precio_unitario: Number(product.precio)
        })
        .select('id_detalle')
        .single();

      if (detalleError) throw detalleError;

      if (product.controla_serie) {
        const { data: unidadesDisp, error: uniFetchErr } = await supabase
          .from('unidades_inventario')
          .select('id_unidad')
          .eq('id_componente', product.id_componente)
          .eq('estado', 'DISPONIBLE')
          .limit(quantity);

        if (uniFetchErr) throw uniFetchErr;

        if (unidadesDisp && unidadesDisp.length > 0) {
          const idsUnidades = unidadesDisp.map(u => u.id_unidad);
          const { error: uniUpdateErr } = await supabase
            .from('unidades_inventario')
            .update({
              estado: 'VENDIDO',
              id_detalle_venta: detalle.id_detalle
            })
            .in('id_unidad', idsUnidades);

          if (uniUpdateErr) throw uniUpdateErr;
        }
      }

      const nuevoStock = Math.max(0, Number(product.stock) - quantity);
      const { error: stockError } = await supabase
        .from('componentes')
        .update({ stock: nuevoStock })
        .eq('id_componente', product.id_componente);

      if (stockError) throw stockError;
    }

    cart.clear();
    updateCartUI();
    document.querySelector('#checkout-form').reset();

    if (feedbackEl) {
      feedbackEl.style.color = '#16a34a';
      feedbackEl.textContent = `✓ Venta registrada con folio: ${venta.folio_venta}`;
    }

    await loadProducts();
  } catch (err) {
    console.error('Error al registrar la venta:', err);
    if (feedbackEl) {
      feedbackEl.style.color = '#dc2626';
      feedbackEl.textContent = `Error al registrar: ${err.message || 'Verifica políticas RLS en Supabase.'}`;
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '✓ Registrar Venta';
  }
}

// ------------------------------------------------------------------
// 8. Módulo para Ver y Gestionar Ventas
// ------------------------------------------------------------------
async function loadSales() {
  const listEl = document.querySelector('#sales-list');
  if (listEl) listEl.innerHTML = '<p class="empty-cart">Consultando ventas en Supabase...</p>';

  try {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id_venta,
        folio_venta,
        fecha_venta,
        total,
        estado,
        usuarios (
          num_cliente,
          nombre,
          correo,
          numero_tel
        ),
        detalle_venta (
          id_detalle,
          cantidad,
          precio_unitario,
          componentes (
            marca,
            modelo,
            tipo
          ),
          unidades_inventario (
            numero_serie
          )
        )
      `)
      .order('fecha_venta', { ascending: false });

    if (error) throw error;

    allSales = data || [];
    renderSalesList();
  } catch (err) {
    console.error('Error al cargar ventas:', err);
    if (listEl) {
      listEl.innerHTML = `<p class="empty-cart" style="color:#dc2626;">Error al cargar las ventas: ${escapeHTML(err.message)}</p>`;
    }
  }
}

function saleStatusBadgeStyle(estado) {
  if (estado === 'PAGADA') return 'background:#dcfce7; color:#166534; border:1px solid #86efac;';
  if (estado === 'PENDIENTE') return 'background:#fef9c3; color:#854d0e; border:1px solid #fde047;';
  return 'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;';
}

function renderSalesList() {
  const listEl = document.querySelector('#sales-list');
  const countEl = document.querySelector('#sales-count');
  const grandTotalEl = document.querySelector('#sales-grand-total');
  if (!listEl) return;

  const query = normalizeText(document.querySelector('#sales-search')?.value || '');
  const statusFilter = document.querySelector('#sales-filter-status')?.value || 'TODOS';

  const filtered = allSales.filter(sale => {
    const matchesStatus = statusFilter === 'TODOS' || sale.estado === statusFilter;
    const clientName = normalizeText(sale.usuarios?.nombre || '');
    const clientEmail = normalizeText(sale.usuarios?.correo || '');
    const folio = normalizeText(sale.folio_venta || '');
    const matchesQuery = !query || folio.includes(query) || clientName.includes(query) || clientEmail.includes(query);
    return matchesStatus && matchesQuery;
  });

  const sumTotal = filtered
    .filter(s => s.estado !== 'CANCELADA')
    .reduce((acc, s) => acc + Number(s.total || 0), 0);

  if (countEl) countEl.textContent = filtered.length;
  if (grandTotalEl) grandTotalEl.textContent = `${money.format(sumTotal)} MXN`;

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-cart">No se encontraron ventas con los filtros actuales.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(sale => {
    const cliente = sale.usuarios || {};
    const detalles = sale.detalle_venta || [];

    const detallesHTML = detalles.map(det => {
      const comp = det.componentes || {};
      const series = (det.unidades_inventario || []).map(u => u.numero_serie);
      const seriesTag = series.length
        ? `<small style="display:block; color:#0869e8;">S/N: ${escapeHTML(series.join(', '))}</small>`
        : '';
      const subtotal = Number(det.cantidad) * Number(det.precio_unitario);

      return `
        <li style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #e2e8f0; font-size:12px;">
          <span>
            <strong>${det.cantidad}x</strong> ${escapeHTML(comp.marca || '')} ${escapeHTML(comp.modelo || 'Componente')}
            ${seriesTag}
          </span>
          <span>${money.format(subtotal)}</span>
        </li>`;
    }).join('');

    const actionButtons = sale.estado === 'PENDIENTE'
      ? `
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button type="button" onclick="updateSaleStatus(${sale.id_venta}, 'PAGADA')" style="background:#16a34a; color:#fff; border:0; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:600;">✓ Marcar Pagada</button>
          <button type="button" onclick="updateSaleStatus(${sale.id_venta}, 'CANCELADA')" style="background:#dc2626; color:#fff; border:0; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:600;">✕ Cancelar</button>
        </div>`
      : '';

    return `
      <article style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; background:#fff;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <strong style="font-size:14px; color:#0f172a;">${escapeHTML(sale.folio_venta)}</strong>
            <span style="margin-left:8px; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:700; ${saleStatusBadgeStyle(sale.estado)}">${escapeHTML(sale.estado)}</span>
            <p style="margin:4px 0 0; font-size:12px; color:#475569;">
              Cliente: <strong>${escapeHTML(cliente.nombre || 'N/A')}</strong> (${escapeHTML(cliente.correo || '')})
            </p>
            <small style="color:#64748b;">Fecha: ${formatDate(sale.fecha_venta)}</small>
          </div>
          <div style="text-align:right;">
            <span style="font-size:11px; color:#64748b; display:block;">Total</span>
            <strong style="font-size:15px; color:#0869e8;">${money.format(Number(sale.total))} MXN</strong>
          </div>
        </div>

        <details style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
          <summary style="cursor:pointer; font-size:12px; font-weight:600; color:#334155;">
            Ver ${detalles.length} producto(s) vendido(s)
          </summary>
          <ul style="list-style:none; padding:6px 0 0; margin:0;">
            ${detallesHTML || '<li style="font-size:12px; color:#64748b;">Sin partidas registradas.</li>'}
          </ul>
        </details>

        ${actionButtons}
      </article>`;
  }).join('');
}

async function updateSaleStatus(idVenta, nuevoEstado) {
  try {
    const { error } = await supabase
      .from('ventas')
      .update({ estado: nuevoEstado })
      .eq('id_venta', idVenta);

    if (error) throw error;
    await loadSales();
  } catch (err) {
    console.error('Error al actualizar estado de venta:', err);
    alert(`No se pudo actualizar el estado: ${err.message}`);
  }
}

window.updateSaleStatus = updateSaleStatus;

// ------------------------------------------------------------------
// 9. Lógica Drag & Drop (Arma tu PC)
// ------------------------------------------------------------------
function setupDragAndDrop() {
  document.addEventListener('dragstart', event => {
    const card = event.target.closest('[data-drag-id]');
    if (card) {
      event.dataTransfer.setData('text/plain', card.dataset.dragId);
      event.dataTransfer.effectAllowed = 'copy';
    }
  });

  const dropSlots = document.querySelectorAll('.drop-slot');

  dropSlots.forEach(slot => {
    slot.addEventListener('dragover', event => {
      event.preventDefault();
      slot.classList.add('drag-over');
    });

    slot.addEventListener('dragleave', () => {
      slot.classList.remove('drag-over');
    });

    slot.addEventListener('drop', event => {
      event.preventDefault();
      slot.classList.remove('drag-over');
      
      const productId = event.dataTransfer.getData('text/plain');
      const product = products.find(p => String(p.id_componente) === String(productId));

      if (!product) return;

      const slotType = normalizeText(slot.dataset.slot);
      const productType = normalizeText(product.tipo);

      if (slotType !== productType) {
        alert(`Este espacio es exclusivo para componentes del tipo "${slot.dataset.slot}".`);
        return;
      }

      builderSetup.set(slot.dataset.slot, product);
      updateBuilderUI();
    });
  });
}

function removeSlotItem(slotName) {
  builderSetup.delete(slotName);
  updateBuilderUI();
}

window.removeSlotItem = removeSlotItem;

function updateBuilderUI() {
  let totalPrice = 0;
  const dropSlots = document.querySelectorAll('.drop-slot');

  dropSlots.forEach(slot => {
    const slotName = slot.dataset.slot;
    const contentDiv = slot.querySelector('.slot-content');
    const product = builderSetup.get(slotName);

    if (product) {
      slot.classList.add('filled');
      totalPrice += Number(product.precio) || 0;
      update3DPiece(slotName, true);

      contentDiv.innerHTML = `
        <div class="slotted-item">
          <span>
            <strong>${escapeHTML(product.marca)} ${escapeHTML(product.modelo)}</strong>
            <small style="display:block; color:#647084;">${money.format(product.precio)}</small>
          </span>
          <button class="remove-slotted" type="button" onclick="removeSlotItem('${slotName}')">✕</button>
        </div>`;
    } else {
      slot.classList.remove('filled');
      update3DPiece(slotName, false);
      contentDiv.innerHTML = `Arrastra un(a) ${slotName} aquí`;
    }
  });

  const totalPriceEl = document.querySelector('#builder-total-price');
  if (totalPriceEl) {
    totalPriceEl.textContent = money.format(totalPrice);
  }
  analyzePerformance();
}

// ------------------------------------------------------------------
// 10. Diagnóstico de Rendimiento
// ------------------------------------------------------------------
function analyzePerformance() {
  const detailsContainer = document.querySelector('#builder-details');
  if (!detailsContainer) return;

  const gpu = builderSetup.get('GPU');
  const psu = builderSetup.get('fuente de poder');

  if (builderSetup.size === 0) {
    detailsContainer.innerHTML = '<p class="empty-summary">Arrastra componentes hacia las casillas superiores para analizar las capacidades del equipo.</p>';
    return;
  }

  let performanceLevel = 'Gama de Entrada / Oficina';
  let capabilities = [];

  const gpuName = gpu ? `${gpu.marca} ${gpu.modelo}`.toLowerCase() : '';

  if (gpuName.includes('5070') || gpuName.includes('4080') || gpuName.includes('4090') || gpuName.includes('9070')) {
    performanceLevel = 'Gama Alta / Enthusiast';
    capabilities.push('Gaming fluido en 4K Ultra (>90 FPS)');
    capabilities.push('Edición de video 8K y Renderizado 3D pesado');
    capabilities.push('Streaming profesional en simultáneo');
  } else if (gpuName.includes('4060') || gpuName.includes('7700') || gpuName.includes('3060')) {
    performanceLevel = 'Gama Media / Competitivo';
    capabilities.push('Gaming en 1080p y 1440p en calidad Alta');
    capabilities.push('Edición de video 4K y diseño gráfico avanzado');
    capabilities.push('Juegos competitivos (Esports) a más de 144 FPS');
  } else if (gpu) {
    performanceLevel = 'Gama de Entrada Gamer';
    capabilities.push('Gaming en 1080p en calidad Media');
    capabilities.push('Multitarea fluida y edición fotográfica');
  } else {
    capabilities.push('Navegación web, tareas de oficina y reproducción multimedia HD.');
  }

  let psuAdvice = '';
  if (gpuName.includes('5070') && psu && Number(psu.modelo.replace(/\D/g, '')) < 750) {
    psuAdvice = '<p style="color:#e11d48; margin-top:8px;">⚠️ <strong>Advertencia:</strong> Se recomienda una fuente de poder de al menos 750W para esta tarjeta gráfica.</p>';
  }

  detailsContainer.innerHTML = `
    <span class="performance-badge" style="display:inline-block; padding:3px 8px; background:#dbeafe; color:#1e40af; border-radius:4px; font-weight:700; font-size:11px; margin-bottom:8px;">${performanceLevel}</span>
    <p><strong>Capacidad estimada:</strong></p>
    <ul style="padding-left: 18px; margin: 6px 0;">
      ${capabilities.map(cap => `<li>${cap}</li>`).join('')}
    </ul>
    ${psuAdvice}
  `;
}

// ------------------------------------------------------------------
// 11. Event Listeners e Inicialización
// ------------------------------------------------------------------
function initApp() {
  document.addEventListener('click', event => {
    const addButton = event.target.closest('[data-add]');
    if (addButton) addToCart(addButton.dataset.add);
  });

  document.querySelector('#search-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const query = document.querySelector('#search-input').value.trim().toLocaleLowerCase('es-MX');
    const filtered = query
      ? products.filter(p => `${p.marca} ${p.modelo} ${p.tipo} ${p.descripcion || ''}`.toLocaleLowerCase('es-MX').includes(query))
      : products;
    renderProducts(filtered);
    
    const statusEl = getStatusMessage();
    if (statusEl) {
      statusEl.textContent = query
        ? `${filtered.length} resultado(s) para "${query}".`
        : `Catálogo cargado (${products.length} componentes).`;
    }
  });

  document.querySelector('#cart-button')?.addEventListener('click', () => {
    const feedbackEl = document.querySelector('#sale-feedback');
    if (feedbackEl) feedbackEl.textContent = '';
    updateCartUI();
    document.querySelector('#cart-dialog')?.showModal();
  });

  document.querySelector('#close-cart')?.addEventListener('click', () => {
    document.querySelector('#cart-dialog')?.close();
  });

  document.querySelector('#checkout-form')?.addEventListener('submit', handleRegisterSale);

  document.querySelector('#open-sales-btn')?.addEventListener('click', async () => {
    document.querySelector('#sales-dialog')?.showModal();
    await loadSales();
  });

  document.querySelector('#close-sales')?.addEventListener('click', () => {
    document.querySelector('#sales-dialog')?.close();
  });

  document.querySelector('#refresh-sales-btn')?.addEventListener('click', loadSales);
  document.querySelector('#sales-search')?.addEventListener('input', renderSalesList);
  document.querySelector('#sales-filter-status')?.addEventListener('change', renderSalesList);

  document.querySelector('#add-builder-to-cart')?.addEventListener('click', () => {
    if (builderSetup.size === 0) {
      alert('Arrastra al menos un componente a las casillas antes de agregar el setup al carrito.');
      return;
    }
    builderSetup.forEach(product => {
      addToCart(product.id_componente);
    });
    alert('Se han agregado todos los componentes seleccionados de tu setup al carrito.');
  });

  const yearEl = document.querySelector('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  setupDragAndDrop();
  init3DCase('case-3d-container');
  loadProducts();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}