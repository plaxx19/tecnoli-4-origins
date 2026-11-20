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

const LOW_STOCK_LIMIT = 3;

// Tipos de componente: "value" es lo que se guarda en la columna "tipo" de Supabase.
// Si tu base usa otros nombres (por ejemplo "Procesador"), cambia solo el "value".
const COMPONENT_TYPES = [
  { value: 'CPU',             label: 'Procesador (CPU)',     short: 'CPU' },
  { value: 'GPU',             label: 'Tarjeta gráfica (GPU)', short: 'GPU' },
  { value: 'Motherboard',     label: 'Motherboard',          short: 'Motherboard' },
  { value: 'RAM',             label: 'Memoria RAM',          short: 'RAM' },
  { value: 'fuente de poder', label: 'Fuente de poder',      short: 'Fuente' },
  { value: 'almacenamiento',  label: 'Almacenamiento',       short: 'Disco' },
  { value: 'gabinete',        label: 'Gabinete',             short: 'Gabinete' },
  { value: 'refrigeracion',   label: 'Refrigeración',        short: 'Cooler' }
];

// Sinónimos aceptados al comparar tipos (ya normalizados: sin acentos, minúsculas)
const TYPE_ALIASES = { procesador: 'cpu', procesadores: 'cpu' };

let products = [];
let inventory = [];
let allSales = [];
const cart = new Map();
const builderSetup = new Map();

let scene3D, camera3D, renderer3D, caseMesh, pcGroup;
let animationId = null;
let render3DActive = false;
const installed3DMeshes = new Map();

// pos / size en unidades 3D. "opacity" hace la pieza translúcida (gabinete).
const SLOT_CONFIG_3D = {
  'Motherboard':     { pos: [0, 0.1, -0.2],    size: [0.1, 3.0, 3.0],  color: 0x10b981 },
  'CPU':             { pos: [0.11, 0.5, 0.3],  size: [0.12, 0.5, 0.5], color: 0xa855f7 },
  'GPU':             { pos: [0.3, -0.3, 0.2],  size: [0.8, 0.8, 2.3],  color: 0xef4444 },
  'RAM':             { pos: [0.2, 0.7, -0.4],  size: [0.1, 0.8, 0.2],  color: 0xf59e0b },
  'fuente de poder': { pos: [0, -1.4, 0],      size: [1.6, 0.8, 1.6],  color: 0x6366f1 },
  'almacenamiento':  { pos: [-0.6, -1.1, 1.1], size: [0.6, 0.2, 1.0],  color: 0x06b6d4 },
  'gabinete':        { pos: [0, 0, 0],         size: [2.1, 4.1, 4.1],  color: 0x3b82f6, opacity: 0.15 },
  'refrigeracion':   { pos: [0, 1.5, -0.2],    size: [0.8, 0.5, 2.5],  color: 0x38bdf8 }
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

function canonicalType(tipo = '') {
  const normalized = normalizeText(tipo);
  return TYPE_ALIASES[normalized] || normalized;
}

function typeLabel(tipo) {
  const found = COMPONENT_TYPES.find(t => canonicalType(t.value) === canonicalType(tipo));
  return found ? found.label : String(tipo || 'Sin tipo');
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

function stockTag(product) {
  const stock = Number(product.stock) || 0;
  const level = stock <= LOW_STOCK_LIMIT ? ' low' : '';
  return `<small class="stock-tag${level}">Stock: ${stock}</small>`;
}

// ------------------------------------------------------------------
// 4. Renderizado 3D (Three.js)
// ------------------------------------------------------------------
function init3DCase(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const width = container.clientWidth || 340;
  const height = container.clientHeight || 220;

  try {
    renderer3D = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    console.error('WebGL no disponible:', err);
    container.innerHTML = '<p class="empty-cart">Tu navegador no pudo iniciar el visor 3D.</p>';
    return;
  }

  scene3D = new THREE.Scene();
  camera3D = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer3D.setSize(width, height);
  container.innerHTML = '';
  container.appendChild(renderer3D.domElement);

  scene3D.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 10, 7);
  scene3D.add(sun);

  // Todo (gabinete y piezas) cuelga de un grupo para que rote junto
  pcGroup = new THREE.Group();
  scene3D.add(pcGroup);

  caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 4.2, 4.2),
    new THREE.MeshStandardMaterial({
      color: 0x0874ed,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    })
  );
  pcGroup.add(caseMesh);

  camera3D.position.set(5, 3, 6);
  camera3D.lookAt(0, 0, 0);

  // Ajusta el visor cuando cambia el tamaño del contenedor
  new ResizeObserver(() => resize3D(container)).observe(container);

  // Solo anima mientras el visor está en pantalla
  new IntersectionObserver(entries => {
    setRender3D(entries[0].isIntersecting);
  }).observe(container);

  window.addEventListener('pagehide', () => {
    setRender3D(false);
    renderer3D.dispose();
  });

  setRender3D(true);
}

function resize3D(container) {
  if (!renderer3D || !camera3D) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!width || !height) return;

  renderer3D.setSize(width, height);
  camera3D.aspect = width / height;
  camera3D.updateProjectionMatrix();
}

function setRender3D(active) {
  render3DActive = active;
  if (active && animationId === null) loop3D();
}

function loop3D() {
  if (!render3DActive) {
    animationId = null;
    return;
  }
  animationId = requestAnimationFrame(loop3D);
  if (pcGroup) pcGroup.rotation.y += 0.003;
  renderer3D.render(scene3D, camera3D);
}

function disposeMesh(mesh) {
  if (mesh.geometry) mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(material => material.dispose());
  } else if (mesh.material) {
    mesh.material.dispose();
  }
}

// product = objeto del componente instalado, o null para retirar la pieza
function update3DPiece(slotType, product) {
  if (!pcGroup) return;

  const config = SLOT_CONFIG_3D[slotType];
  if (!config) return;

  const existing = installed3DMeshes.get(slotType);
  const productId = product ? String(product.id_componente) : null;

  // Si ya está montada la misma pieza no se vuelve a crear
  if (existing && existing.userData.productId === productId) return;

  if (existing) {
    pcGroup.remove(existing);
    disposeMesh(existing);
    installed3DMeshes.delete(slotType);
  }

  if (!product) return;

  const isTranslucent = config.opacity !== undefined;
  const geometry = new THREE.BoxGeometry(...config.size);
  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: 0.3,
    metalness: 0.7,
    transparent: isTranslucent,
    opacity: isTranslucent ? config.opacity : 1,
    depthWrite: !isTranslucent
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...config.pos);
  mesh.userData.productId = productId;

  pcGroup.add(mesh);
  installed3DMeshes.set(slotType, mesh);
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
      ${stockTag(product)}
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
      ${stockTag(product)}
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
    const categoryTarget = canonicalType(grid.dataset.category);
    const categoryProducts = list.filter(p => canonicalType(p.tipo) === categoryTarget).slice(0, 3);

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

function deleteFromCart(productId) {
  cart.delete(String(productId));
  updateCartUI();
}

function handleCartAction(action, productId) {
  if (action === 'inc') addToCart(productId);
  else if (action === 'dec') removeFromCart(productId);
  else if (action === 'remove') deleteFromCart(productId);
}

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
          const id = escapeHTML(product.id_componente);
          return `
            <div class="cart-line">
              <div class="cart-line-info">
                <strong>${escapeHTML(displayName)}</strong>
                <small>${qty} × ${money.format(Number(product.precio))}</small>
                <div class="qty-controls">
                  <button type="button" data-cart-action="dec" data-id="${id}" aria-label="Quitar una unidad">−</button>
                  <span>${qty}</span>
                  <button type="button" data-cart-action="inc" data-id="${id}" aria-label="Agregar una unidad">+</button>
                </div>
              </div>
              <div class="cart-line-side">
                <strong>${money.format(Number(product.precio) * qty)}</strong>
                <button type="button" class="remove-button" data-cart-action="remove" data-id="${id}">Eliminar</button>
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
            <strong>${escapeHTML(det.cantidad)}x</strong> ${escapeHTML(comp.marca || '')} ${escapeHTML(comp.modelo || 'Componente')}
            ${seriesTag}
          </span>
          <span>${money.format(subtotal)}</span>
        </li>`;
    }).join('');

    const saleId = escapeHTML(sale.id_venta);
    const actionButtons = sale.estado === 'PENDIENTE'
      ? `
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button type="button" data-sale-id="${saleId}" data-sale-status="PAGADA" style="background:#16a34a; color:#fff; border:0; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:600;">✓ Marcar Pagada</button>
          <button type="button" data-sale-id="${saleId}" data-sale-status="CANCELADA" style="background:#dc2626; color:#fff; border:0; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:600;">✕ Cancelar</button>
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
  if (nuevoEstado === 'CANCELADA' && !confirm('¿Seguro que deseas cancelar esta venta?')) return;

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

// ------------------------------------------------------------------
// 9. Inventario: stock visible/editable y alta de productos nuevos
// ------------------------------------------------------------------
function populateTypeSelects() {
  const options = COMPONENT_TYPES
    .map(t => `<option value="${escapeHTML(t.value)}">${escapeHTML(t.label)}</option>`)
    .join('');

  const formSelect = document.querySelector('#product-type');
  if (formSelect) formSelect.innerHTML = options;

  const filterSelect = document.querySelector('#inventory-filter-type');
  if (filterSelect) filterSelect.innerHTML = `<option value="TODOS">Todos los tipos</option>${options}`;
}

function setFeedback(selector, message, kind = '') {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = message;
  el.className = `form-feedback wide${kind ? ' ' + kind : ''}`;
}

function setInventoryFeedback(message, kind = '') {
  const el = document.querySelector('#inventory-feedback');
  if (!el) return;
  el.textContent = message;
  el.className = `form-feedback${kind ? ' ' + kind : ''}`;
}

async function loadInventory() {
  const body = document.querySelector('#inventory-body');
  if (body) body.innerHTML = '<tr><td colspan="5" class="empty-cart">Consultando inventario...</td></tr>';

  try {
    const { data, error } = await supabase
      .from('componentes')
      .select('*')
      .order('tipo')
      .order('marca');

    if (error) throw error;

    inventory = data || [];
    renderInventory();
  } catch (err) {
    console.error('Error al cargar inventario:', err);
    if (body) {
      body.innerHTML = `<tr><td colspan="5" class="empty-cart" style="color:#dc2626;">Error al cargar el inventario: ${escapeHTML(err.message)}</td></tr>`;
    }
  }
}

function renderInventory() {
  const body = document.querySelector('#inventory-body');
  if (!body) return;

  const query = normalizeText(document.querySelector('#inventory-search')?.value || '');
  const typeFilter = document.querySelector('#inventory-filter-type')?.value || 'TODOS';
  const onlyLow = document.querySelector('#inventory-only-low')?.checked || false;

  const filtered = inventory.filter(item => {
    const matchesType = typeFilter === 'TODOS' || canonicalType(item.tipo) === canonicalType(typeFilter);
    const haystack = normalizeText(`${item.marca} ${item.modelo} ${item.tipo}`);
    const matchesQuery = !query || haystack.includes(query);
    const matchesLow = !onlyLow || (Number(item.stock) || 0) <= LOW_STOCK_LIMIT;
    return matchesType && matchesQuery && matchesLow;
  });

  const units = filtered.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const lowCount = filtered.filter(item => (Number(item.stock) || 0) <= LOW_STOCK_LIMIT).length;

  const countEl = document.querySelector('#inventory-count');
  const unitsEl = document.querySelector('#inventory-units');
  const lowEl = document.querySelector('#inventory-low');
  if (countEl) countEl.textContent = filtered.length;
  if (unitsEl) unitsEl.textContent = units;
  if (lowEl) lowEl.textContent = lowCount;

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty-cart">No hay componentes con los filtros actuales.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(item => {
    const id = escapeHTML(item.id_componente);
    const stock = Number(item.stock) || 0;
    const rowClass = stock <= LOW_STOCK_LIMIT ? 'low-stock-row' : '';

    return `
      <tr class="${rowClass}" data-inv-id="${id}">
        <td>
          <strong>${escapeHTML(item.marca)}</strong> ${escapeHTML(item.modelo)}
          <small>${escapeHTML(typeLabel(item.tipo))}${item.controla_serie ? ' · controla serie' : ''}</small>
        </td>
        <td><input class="inv-input" type="number" min="0" step="0.01" data-field="precio" value="${Number(item.precio) || 0}" aria-label="Precio" /></td>
        <td><input class="inv-input" type="number" min="0" step="1" data-field="stock" value="${stock}" aria-label="Stock" /></td>
        <td class="center"><input type="checkbox" data-field="activo" ${item.activo ? 'checked' : ''} aria-label="Activo" /></td>
        <td><button type="button" class="small-button" data-inv-save="${id}">Guardar</button></td>
      </tr>`;
  }).join('');
}

async function saveInventoryRow(idComponente, rowEl, buttonEl) {
  const item = inventory.find(i => String(i.id_componente) === String(idComponente));
  if (!item || !rowEl) return;

  const precioRaw = rowEl.querySelector('[data-field="precio"]').value.trim();
  const stockRaw = rowEl.querySelector('[data-field="stock"]').value.trim();
  const activo = rowEl.querySelector('[data-field="activo"]').checked;
  const precio = Number(precioRaw);
  const stock = Number(stockRaw);

  if (precioRaw === '' || stockRaw === '' || !Number.isFinite(precio) || precio < 0 || !Number.isInteger(stock) || stock < 0) {
    setInventoryFeedback('Revisa los datos: el precio debe ser 0 o mayor y el stock un número entero de 0 o más.', 'error');
    return;
  }

  try {
    if (buttonEl) buttonEl.disabled = true;

    const { data, error } = await supabase
      .from('componentes')
      .update({ precio, stock, activo })
      .eq('id_componente', item.id_componente)
      .select('id_componente');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No se actualizó ningún registro (revisa las políticas RLS de la tabla componentes).');
    }

    Object.assign(item, { precio, stock, activo });
    renderInventory();
    setInventoryFeedback(`✓ ${item.marca} ${item.modelo} actualizado.`, 'ok');
    await loadProducts();
  } catch (err) {
    console.error('Error al actualizar componente:', err);
    setInventoryFeedback(`No se pudo guardar: ${err.message}`, 'error');
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function handleCreateProduct(event) {
  event.preventDefault();
  const submitBtn = document.querySelector('#save-product-btn');

  const tipo = document.querySelector('#product-type').value;
  const marca = document.querySelector('#product-brand').value.trim();
  const modelo = document.querySelector('#product-model').value.trim();
  const precioRaw = document.querySelector('#product-price').value.trim();
  const stockRaw = document.querySelector('#product-stock').value.trim();
  const badge = document.querySelector('#product-badge').value.trim();
  const imageUrl = document.querySelector('#product-image').value.trim();
  const descripcion = document.querySelector('#product-description').value.trim();
  const activo = document.querySelector('#product-active').checked;
  const bestSeller = document.querySelector('#product-best').checked;
  const controlaSerie = document.querySelector('#product-serial').checked;

  const precio = Number(precioRaw);
  const stock = Number(stockRaw);

  if (!marca || !modelo) {
    setFeedback('#product-feedback', 'La marca y el modelo son obligatorios.', 'error');
    return;
  }
  if (precioRaw === '' || !Number.isFinite(precio) || precio < 0) {
    setFeedback('#product-feedback', 'Ingresa un precio válido (0 o mayor).', 'error');
    return;
  }
  if (stockRaw === '' || !Number.isInteger(stock) || stock < 0) {
    setFeedback('#product-feedback', 'El stock debe ser un número entero de 0 o más.', 'error');
    return;
  }

  const duplicate = inventory.find(item =>
    canonicalType(item.tipo) === canonicalType(tipo) &&
    normalizeText(item.marca) === normalizeText(marca) &&
    normalizeText(item.modelo) === normalizeText(modelo)
  );
  if (duplicate && !confirm('Ya existe un componente con la misma marca, modelo y tipo. ¿Quieres registrarlo de todos modos?')) {
    return;
  }

  try {
    submitBtn.disabled = true;
    setFeedback('#product-feedback', 'Guardando producto...', '');

    const { data, error } = await supabase
      .from('componentes')
      .insert({
        tipo,
        marca,
        modelo,
        precio,
        stock,
        badge: badge || null,
        image_url: imageUrl || null,
        descripcion: descripcion || null,
        activo,
        best_seller: bestSeller,
        controla_serie: controlaSerie
      })
      .select('*')
      .single();

    if (error) throw error;

    document.querySelector('#product-form').reset();
    document.querySelector('#product-active').checked = true;
    setFeedback('#product-feedback', `✓ Producto registrado: ${data.marca} ${data.modelo}`, 'ok');

    await loadInventory();
    await loadProducts();
  } catch (err) {
    console.error('Error al registrar producto:', err);
    setFeedback('#product-feedback', `Error al registrar: ${err.message || 'Revisa las políticas RLS y los nombres de columnas.'}`, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

// ------------------------------------------------------------------
// 10. Lógica Drag & Drop (Arma tu PC)
// ------------------------------------------------------------------
function setupDragAndDrop() {
  document.addEventListener('dragstart', event => {
    const card = event.target.closest?.('[data-drag-id]');
    if (card) {
      event.dataTransfer.setData('text/plain', card.dataset.dragId);
      event.dataTransfer.effectAllowed = 'copy';
    }
  });

  const dropSlots = document.querySelectorAll('.drop-slot');

  dropSlots.forEach(slot => {
    slot.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
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

      // Regla de compatibilidad: la casilla solo acepta su propio tipo de componente
      if (canonicalType(slot.dataset.slot) !== canonicalType(product.tipo)) {
        alert(`Este espacio es exclusivo para componentes del tipo "${typeLabel(slot.dataset.slot)}".`);
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
      update3DPiece(slotName, product);

      contentDiv.innerHTML = `
        <div class="slotted-item">
          <span>
            <strong>${escapeHTML(product.marca)} ${escapeHTML(product.modelo)}</strong>
            <small style="display:block; color:#647084;">${money.format(Number(product.precio) || 0)}</small>
          </span>
          <button class="remove-slotted" type="button" data-remove-slot="${escapeHTML(slotName)}" aria-label="Quitar componente">✕</button>
        </div>`;
    } else {
      slot.classList.remove('filled');
      update3DPiece(slotName, null);
      const shortName = COMPONENT_TYPES.find(t => t.value === slotName)?.short || slotName;
      contentDiv.textContent = `Arrastra ${shortName} aquí`;
    }
  });

  const totalPriceEl = document.querySelector('#builder-total-price');
  if (totalPriceEl) {
    totalPriceEl.textContent = `${money.format(totalPrice)} MXN`;
  }
  analyzePerformance();
}

// ------------------------------------------------------------------
// 11. Diagnóstico de Rendimiento
// ------------------------------------------------------------------
const GPU_HIGH_END = ['5090', '5080', '5070', '4090', '4080', '9070', '7900'];
const GPU_MID_RANGE = ['4070', '4060', '3070', '3060', '7700', '7600', '9060', '6700'];

// Lee los watts de la fuente: prefiere un número seguido de "W" ("750W");
// si no existe, usa el primer grupo de 3-4 dígitos del modelo ("RM850x" => 850).
function getPsuWatts(psu) {
  if (!psu) return null;

  const text = `${psu.modelo || ''} ${psu.descripcion || ''}`;
  const explicit = text.match(/(\d{3,4})\s*w\b/i);
  const fallback = String(psu.modelo || '').match(/\d{3,4}/);
  const watts = explicit ? Number(explicit[1]) : (fallback ? Number(fallback[0]) : null);

  return watts && watts >= 200 && watts <= 2000 ? watts : null;
}

function analyzePerformance() {
  const detailsContainer = document.querySelector('#builder-details');
  if (!detailsContainer) return;

  if (builderSetup.size === 0) {
    detailsContainer.innerHTML = '<p class="empty-summary">Arrastra componentes hacia las casillas superiores para analizar las capacidades del equipo.</p>';
    return;
  }

  const gpu = builderSetup.get('GPU');
  const cpu = builderSetup.get('CPU');
  const psu = builderSetup.get('fuente de poder');

  let performanceLevel = 'Gama de Entrada / Oficina';
  let recommendedWatts = 0;
  const capabilities = [];

  const gpuName = gpu ? `${gpu.marca} ${gpu.modelo}`.toLowerCase() : '';
  const isHighEnd = GPU_HIGH_END.some(key => gpuName.includes(key));
  const isMidRange = !isHighEnd && GPU_MID_RANGE.some(key => gpuName.includes(key));

  if (isHighEnd) {
    performanceLevel = 'Gama Alta / Enthusiast';
    recommendedWatts = 750;
    capabilities.push('Gaming fluido en 4K Ultra (>90 FPS)');
    capabilities.push('Edición de video 8K y Renderizado 3D pesado');
    capabilities.push('Streaming profesional en simultáneo');
  } else if (isMidRange) {
    performanceLevel = 'Gama Media / Competitivo';
    recommendedWatts = 550;
    capabilities.push('Gaming en 1080p y 1440p en calidad Alta');
    capabilities.push('Edición de video 4K y diseño gráfico avanzado');
    capabilities.push('Juegos competitivos (Esports) a más de 144 FPS');
  } else if (gpu) {
    performanceLevel = 'Gama de Entrada Gamer';
    recommendedWatts = 450;
    capabilities.push('Gaming en 1080p en calidad Media');
    capabilities.push('Multitarea fluida y edición fotográfica');
  } else {
    capabilities.push('Navegación web, tareas de oficina y reproducción multimedia HD.');
  }

  if (cpu) {
    capabilities.push(`Procesador: ${escapeHTML(cpu.marca)} ${escapeHTML(cpu.modelo)}`);
  }

  let psuAdvice = '';
  if (gpu && psu) {
    const watts = getPsuWatts(psu);
    if (watts && watts < recommendedWatts) {
      psuAdvice = `<p class="warning-text">⚠️ <strong>Advertencia:</strong> la fuente seleccionada (${watts} W) está por debajo de los ${recommendedWatts} W recomendados para esta tarjeta gráfica.</p>`;
    }
  }

  const missing = COMPONENT_TYPES.filter(t => !builderSetup.has(t.value)).map(t => t.short);
  const missingHTML = missing.length
    ? `<p class="missing-parts">Faltan: ${escapeHTML(missing.join(', '))}</p>`
    : '<p class="complete-parts">✓ Configuración completa</p>';

  detailsContainer.innerHTML = `
    <span class="performance-badge">${performanceLevel}</span>
    <p><strong>Capacidad estimada:</strong></p>
    <ul style="padding-left: 18px; margin: 6px 0;">
      ${capabilities.map(cap => `<li>${cap}</li>`).join('')}
    </ul>
    ${psuAdvice}
    ${missingHTML}
  `;
}

// ------------------------------------------------------------------
// 12. Búsqueda del catálogo
// ------------------------------------------------------------------
function runCatalogSearch() {
  const query = normalizeText(document.querySelector('#search-input')?.value || '');
  const filtered = query
    ? products.filter(p => normalizeText(`${p.marca} ${p.modelo} ${p.tipo} ${p.descripcion || ''}`).includes(query))
    : products;

  renderProducts(filtered);

  const statusEl = getStatusMessage();
  if (statusEl) {
    statusEl.textContent = query
      ? `${filtered.length} resultado(s) para "${query}".`
      : `Catálogo cargado (${products.length} componentes).`;
  }
}

// ------------------------------------------------------------------
// 13. Event Listeners e Inicialización
// ------------------------------------------------------------------
function initApp() {
  populateTypeSelects();

  // Un único listener de clics para todos los botones generados dinámicamente
  document.addEventListener('click', event => {
    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      addToCart(addButton.dataset.add);
      return;
    }

    const cartButton = event.target.closest('[data-cart-action]');
    if (cartButton) {
      handleCartAction(cartButton.dataset.cartAction, cartButton.dataset.id);
      return;
    }

    const removeSlotButton = event.target.closest('[data-remove-slot]');
    if (removeSlotButton) {
      removeSlotItem(removeSlotButton.dataset.removeSlot);
      return;
    }

    const saleButton = event.target.closest('[data-sale-status]');
    if (saleButton) {
      updateSaleStatus(saleButton.dataset.saleId, saleButton.dataset.saleStatus);
      return;
    }

    const inventorySaveButton = event.target.closest('[data-inv-save]');
    if (inventorySaveButton) {
      saveInventoryRow(inventorySaveButton.dataset.invSave, inventorySaveButton.closest('tr'), inventorySaveButton);
    }
  });

  // Búsqueda
  document.querySelector('#search-form')?.addEventListener('submit', event => {
    event.preventDefault();
    runCatalogSearch();
  });
  document.querySelector('#search-input')?.addEventListener('input', runCatalogSearch);

  // Carrito
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

  // Ventas
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

  // Inventario
  document.querySelector('#open-inventory-btn')?.addEventListener('click', async () => {
    setInventoryFeedback('');
    document.querySelector('#inventory-dialog')?.showModal();
    await loadInventory();
  });

  document.querySelector('#close-inventory')?.addEventListener('click', () => {
    document.querySelector('#inventory-dialog')?.close();
  });

  document.querySelector('#refresh-inventory-btn')?.addEventListener('click', loadInventory);
  document.querySelector('#inventory-search')?.addEventListener('input', renderInventory);
  document.querySelector('#inventory-filter-type')?.addEventListener('change', renderInventory);
  document.querySelector('#inventory-only-low')?.addEventListener('change', renderInventory);
  document.querySelector('#product-form')?.addEventListener('submit', handleCreateProduct);

  // Armador
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