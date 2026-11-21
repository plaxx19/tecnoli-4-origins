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
const SESSION_STORAGE_KEY = 'tecnoli_user_session';
const CART_STORAGE_KEY = 'tecnoli_cart_items';

const COMPONENT_TYPES = [
  { value: 'CPU',             label: 'Procesador (CPU)',      short: 'CPU' },
  { value: 'GPU',             label: 'Tarjeta gráfica (GPU)', short: 'GPU' },
  { value: 'Motherboard',     label: 'Motherboard',           short: 'Motherboard' },
  { value: 'RAM',             label: 'Memoria RAM',           short: 'RAM' },
  { value: 'fuente de poder', label: 'Fuente de poder',       short: 'Fuente' },
  { value: 'almacenamiento',  label: 'Almacenamiento',        short: 'Disco' },
  { value: 'gabinete',        label: 'Gabinete',              short: 'Gabinete' },
  { value: 'refrigeracion',   label: 'Refrigeración',         short: 'Cooler' }
];

const TYPE_ALIASES = { procesador: 'cpu', procesadores: 'cpu' };

// Métodos de pago disponibles y mensajes de orientación para el usuario
const PAYMENT_METHODS = {
  TARJETA: {
    code: 'TARJETA',
    label: 'Tarjeta Crédito / Débito',
    shortLabel: 'Tarjeta',
    icon: '💳',
    suggestedStatus: 'PAGADA',
    guidance: '💳 Pago con tarjeta seleccionado: Aprobación inmediata con Visa, Mastercard o AMEX. Estado sugerido: PAGADA.'
  },
  TRANSFERENCIA: {
    code: 'TRANSFERENCIA',
    label: 'Transferencia SPEI',
    shortLabel: 'SPEI',
    icon: '🏦',
    suggestedStatus: 'PENDIENTE',
    guidance: '🏦 Transferencia SPEI seleccionada: El pedido quedará reservado en espera de validar tu comprobante bancario. Estado sugerido: PENDIENTE.'
  },
  PAYPAL: {
    code: 'PAYPAL',
    label: 'PayPal / Billetera Digital',
    shortLabel: 'PayPal',
    icon: '🅿️',
    suggestedStatus: 'PAGADA',
    guidance: '🅿️ PayPal seleccionado: Confirmación automática mediante tu cuenta vinculada con protección al comprador. Estado sugerido: PAGADA.'
  },
  EFECTIVO: {
    code: 'EFECTIVO',
    label: 'Efectivo / Pago en Tienda',
    shortLabel: 'Efectivo',
    icon: '💵',
    suggestedStatus: 'PENDIENTE',
    guidance: '💵 Pago en efectivo seleccionado: Liquida el total directamente en sucursal o contra entrega. Estado sugerido: PENDIENTE.'
  }
};

let products = [];
let inventory = [];
let allSales = [];
let allUsers = [];
let currentUser = null;
let clearCartConfirmTimer = null;

let selectedPaymentMethod = '';
const cart = new Map();
const builderSetup = new Map();

let scene3D, camera3D, renderer3D, caseMesh, pcGroup;
let animationId = null;
let render3DActive = false;
const installed3DMeshes = new Map();

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

function getPaymentMethodMeta(rawMethod) {
  if (!rawMethod) return null;
  const key = String(rawMethod).trim().toUpperCase();
  return PAYMENT_METHODS[key] || {
    code: key,
    label: String(rawMethod),
    shortLabel: String(rawMethod),
    icon: '💳'
  };
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}

function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function isAdminUser(user = currentUser) {
  return String(user?.rol || '').toUpperCase() === 'ADMIN';
}

async function hashPasswordSHA256(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

  new ResizeObserver(() => resize3D(container)).observe(container);

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

function update3DPiece(slotType, product) {
  if (!pcGroup) return;

  const config = SLOT_CONFIG_3D[slotType];
  if (!config) return;

  const existing = installed3DMeshes.get(slotType);
  const productId = product ? String(product.id_componente) : null;

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
    restoreCartFromStorage(products);

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
// 7. Manejo del Carrito, Selección de Pago y Registro de Venta
// ------------------------------------------------------------------
function saveCartToStorage() {
  try {
    const payload = [...cart.values()].map(({ product, quantity }) => ({
      id_componente: String(product.id_componente),
      quantity: Number(quantity) || 1
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('No se pudo guardar el carrito en localStorage:', err);
  }
}

function restoreCartFromStorage(availableProducts = products) {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;

    const savedList = JSON.parse(raw);
    if (!Array.isArray(savedList)) return;

    cart.clear();
    for (const entry of savedList) {
      const id = String(entry?.id_componente || '');
      const desiredQty = Math.max(1, Number(entry?.quantity) || 1);
      const product = availableProducts.find(p => String(p.id_componente) === id);
      const maxStock = Number(product?.stock) || 0;

      if (product && maxStock > 0) {
        cart.set(id, {
          product,
          quantity: Math.min(desiredQty, maxStock)
        });
      }
    }

    saveCartToStorage();
    updateCartUI();
  } catch (err) {
    console.warn('Carrito guardado inválido, limpiando...', err);
    localStorage.removeItem(CART_STORAGE_KEY);
  }
}

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
  saveCartToStorage();
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
  saveCartToStorage();
  updateCartUI();
}

function deleteFromCart(productId) {
  cart.delete(String(productId));
  saveCartToStorage();
  updateCartUI();
}

function resetClearCartButton() {
  clearTimeout(clearCartConfirmTimer);
  const clearBtn = document.querySelector('#clear-cart-btn');
  if (!clearBtn) return;
  clearBtn.dataset.confirming = 'false';
  clearBtn.textContent = '🗑 Vaciar carrito';
  clearBtn.style.fontWeight = '';
}

function clearCart() {
  if (cart.size === 0) return;

  const clearBtn = document.querySelector('#clear-cart-btn');
  if (!clearBtn) {
    cart.clear();
    saveCartToStorage();
    updateCartUI();
    return;
  }

  if (clearBtn.dataset.confirming !== 'true') {
    clearBtn.dataset.confirming = 'true';
    clearBtn.textContent = '⚠ ¿Seguro? Clic para vaciar';
    clearBtn.style.fontWeight = '700';

    clearTimeout(clearCartConfirmTimer);
    clearCartConfirmTimer = setTimeout(() => {
      resetClearCartButton();
    }, 3500);
    return;
  }

  resetClearCartButton();
  cart.clear();
  saveCartToStorage();
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
  const clearBtn = document.querySelector('#clear-cart-btn');

  if (countEl) countEl.textContent = quantity;
  if (totalEl) totalEl.textContent = money.format(total);
  if (dialogTotalEl) dialogTotalEl.textContent = money.format(total);

  if (clearBtn) {
    clearBtn.disabled = entries.length === 0;
    if (entries.length === 0) resetClearCartButton();
  }

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

function selectPaymentMethod(methodCode) {
  const methodInfo = PAYMENT_METHODS[methodCode] || null;
  selectedPaymentMethod = methodInfo ? methodInfo.code : '';

  document.querySelectorAll('.payment-option').forEach(option => {
    const isMatch = option.dataset.method === selectedPaymentMethod;
    option.classList.toggle('selected', isMatch);
    const radio = option.querySelector('input[type="radio"]');
    if (radio) radio.checked = isMatch;
  });

  const guidanceEl = document.querySelector('#payment-guidance');
  const statusSelect = document.querySelector('#sale-status');

  if (methodInfo) {
    if (guidanceEl) {
      guidanceEl.className = 'payment-guidance selected';
      guidanceEl.textContent = methodInfo.guidance;
    }
    if (statusSelect && methodInfo.suggestedStatus) {
      statusSelect.value = methodInfo.suggestedStatus;
    }
  } else if (guidanceEl) {
    guidanceEl.className = 'payment-guidance info';
    guidanceEl.textContent = 'ℹ️ Selecciona una forma de pago para continuar con tu compra.';
  }
}

function resetPaymentSelection() {
  selectedPaymentMethod = '';
  document.querySelectorAll('.payment-option').forEach(option => {
    option.classList.remove('selected');
    const radio = option.querySelector('input[type="radio"]');
    if (radio) radio.checked = false;
  });
  const guidanceEl = document.querySelector('#payment-guidance');
  if (guidanceEl) {
    guidanceEl.className = 'payment-guidance info';
    guidanceEl.textContent = 'ℹ️ Selecciona una forma de pago para continuar con tu compra.';
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
      direccion: direccion || null,
      rol: 'CLIENTE'
    })
    .select('id_usuario')
    .single();

  if (insertError) throw insertError;
  return newUser.id_usuario;
}

async function insertVentaRecord({ idUsuario, folioVenta, total, estado, metodoPago }) {
  async function insertVentaRecord({ idUsuario, folioVenta, total, estado, metodoPago }) {
    const { data, error } = await supabase
      .from('ventas')
      .insert({
        id_usuario: idUsuario,
        folio_venta: folioVenta,
        total,
        estado,
        metodo_pago: metodoPago
      })
      .select('id_venta, folio_venta, metodo_pago')
      .single();
  
    if (error) throw error;
    return data;
  }
}

async function handleRegisterSale(event) {
  event.preventDefault();
  const feedbackEl = document.querySelector('#sale-feedback');
  const guidanceEl = document.querySelector('#payment-guidance');
  const submitBtn = document.querySelector('#register-sale-btn');

  if (cart.size === 0) {
    if (feedbackEl) {
      feedbackEl.style.color = '#dc2626';
      feedbackEl.textContent = 'Agrega al menos un componente al carrito antes de registrar la venta.';
    }
    return;
  }

  if (!selectedPaymentMethod || !PAYMENT_METHODS[selectedPaymentMethod]) {
    if (guidanceEl) {
      guidanceEl.className = 'payment-guidance error';
      guidanceEl.textContent = '⚠️ Por favor elige una forma de pago (Tarjeta, Transferencia, PayPal o Efectivo) para completar tu compra.';
    }
    if (feedbackEl) {
      feedbackEl.style.color = '#dc2626';
      feedbackEl.textContent = 'Debes seleccionar un método de pago antes de registrar la venta.';
    }
    document.querySelector('.payment-option input[type="radio"]')?.focus();
    return;
  }

  const paymentMethodObj = PAYMENT_METHODS[selectedPaymentMethod];
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
      feedbackEl.textContent = `Procesando pago con ${paymentMethodObj.label} en Supabase...`;
    }

    const idUsuario = await resolveOrCreateUsuario({ correo, nombre, numero_tel, direccion });

    const venta = await insertVentaRecord({
      idUsuario,
      folioVenta,
      total,
      estado,
      metodoPago: paymentMethodObj.code
    });

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
    saveCartToStorage();
    updateCartUI();
    document.querySelector('#checkout-form').reset();
    resetPaymentSelection();

    if (feedbackEl) {
      feedbackEl.style.color = '#16a34a';
      feedbackEl.textContent = `✓ Venta registrada con folio: ${venta.folio_venta} (${paymentMethodObj.label})`;
    }

    await loadProducts();
    if (currentUser) await loadMySales();
    if (isAdminUser()) {
      await Promise.all([loadSales(), loadUsersList()]);
    }
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
// 8. Módulo para Ver y Gestionar Ventas (solo ADMIN)
// ------------------------------------------------------------------
async function loadSales() {
  const listEl = document.querySelector('#sales-list');
  if (!isAdminUser()) {
    if (listEl) listEl.innerHTML = '<p class="empty-cart">Acceso restringido a administradores.</p>';
    return;
  }

  if (listEl) listEl.innerHTML = '<p class="empty-cart">Consultando ventas en Supabase...</p>';

  try {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        *,
        usuarios (
          num_cliente,
          nombre,
          correo,
          numero_tel,
          direccion
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
  const breakdownEl = document.querySelector('#sales-payment-breakdown');
  const grandTotalEl = document.querySelector('#sales-grand-total');
  if (!listEl) return;

  if (!isAdminUser()) {
    listEl.innerHTML = '';
    return;
  }

  const query = normalizeText(document.querySelector('#sales-search')?.value || '');
  const statusFilter = document.querySelector('#sales-filter-status')?.value || 'TODOS';
  const paymentFilter = document.querySelector('#sales-filter-payment')?.value || 'TODOS';

  const filtered = allSales.filter(sale => {
    const matchesStatus = statusFilter === 'TODOS' || sale.estado === statusFilter;
    const saleMethod = String(sale.metodo_pago || '').trim().toUpperCase();
    const matchesPayment = paymentFilter === 'TODOS' || saleMethod === paymentFilter;
    const clientName = normalizeText(sale.usuarios?.nombre || '');
    const clientEmail = normalizeText(sale.usuarios?.correo || '');
    const folio = normalizeText(sale.folio_venta || '');
    const paymentLabel = normalizeText(getPaymentMethodMeta(sale.metodo_pago)?.label || '');
    const matchesQuery = !query || folio.includes(query) || clientName.includes(query) || clientEmail.includes(query) || paymentLabel.includes(query);
    return matchesStatus && matchesPayment && matchesQuery;
  });

  const activeSales = filtered.filter(s => s.estado !== 'CANCELADA');
  const sumTotal = activeSales.reduce((acc, s) => acc + Number(s.total || 0), 0);

  // Desglose por método de pago en el historial mostrado
  const methodCounts = {};
  activeSales.forEach(sale => {
    const meta = getPaymentMethodMeta(sale.metodo_pago);
    const label = meta ? `${meta.icon} ${meta.shortLabel}` : 'Sin especificar';
    methodCounts[label] = (methodCounts[label] || 0) + 1;
  });
  const breakdownText = Object.keys(methodCounts).length
    ? Object.entries(methodCounts).map(([label, qty]) => `${label} (${qty})`).join(' · ')
    : 'Sin registros';

  if (countEl) countEl.textContent = filtered.length;
  if (breakdownEl) breakdownEl.textContent = breakdownText;
  if (grandTotalEl) grandTotalEl.textContent = `${money.format(sumTotal)} MXN`;

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-cart">No se encontraron ventas con los filtros actuales.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(sale => {
    const cliente = sale.usuarios || {};
    const detalles = sale.detalle_venta || [];
    const paymentMeta = getPaymentMethodMeta(sale.metodo_pago);

    const paymentBadgeHTML = paymentMeta
      ? `<span class="payment-badge">${paymentMeta.icon} ${escapeHTML(paymentMeta.label)}</span>`
      : `<span class="payment-badge unregistered">Método no registrado</span>`;

    const paymentDetailText = paymentMeta
      ? `${paymentMeta.icon} ${escapeHTML(paymentMeta.label)}`
      : 'No registrado';

    const totalUnidades = detalles.reduce((sum, det) => sum + (Number(det.cantidad) || 0), 0);

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
            ${paymentBadgeHTML}
            <p style="margin:4px 0 0; font-size:12px; color:#475569;">
              Cliente: <strong>${escapeHTML(cliente.nombre || 'N/A')}</strong> (${escapeHTML(cliente.correo || '')})
            </p>
            <small style="color:#64748b;">Fecha: ${formatDate(sale.fecha_venta)} · Pago: <strong>${paymentDetailText}</strong></small>
          </div>
          <div style="text-align:right;">
            <span style="font-size:11px; color:#64748b; display:block;">Total (${totalUnidades} pza${totalUnidades === 1 ? '' : 's'})</span>
            <strong style="font-size:15px; color:#0869e8;">${money.format(Number(sale.total))} MXN</strong>
          </div>
        </div>

        <details style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid #e2e8f0;">
          <summary style="cursor:pointer; font-size:12px; font-weight:600; color:#334155;">
            Ver detalle de venta (${detalles.length} partida${detalles.length === 1 ? '' : 's'})
          </summary>

          <div class="sale-detail-meta" style="margin-top: 8px;">
            <span><strong>Método de pago:</strong> ${paymentDetailText}</span>
            <span><strong>Estado de cobro:</strong> ${escapeHTML(sale.estado)}</span>
            <span><strong>Teléfono:</strong> ${escapeHTML(cliente.numero_tel || 'No registrado')}</span>
            <span><strong>Entrega:</strong> ${escapeHTML(cliente.direccion || 'En tienda / Sin dirección')}</span>
          </div>

          <ul style="list-style:none; padding:4px 0 0; margin:0;">
            ${detallesHTML || '<li style="font-size:12px; color:#64748b;">Sin partidas registradas.</li>'}
          </ul>
        </details>

        ${actionButtons}
      </article>`;
  }).join('');
}

async function updateSaleStatus(idVenta, nuevoEstado) {
  if (!isAdminUser()) return;
  if (nuevoEstado === 'CANCELADA' && !confirm('¿Seguro que deseas cancelar esta venta?')) return;

  try {
    const { error } = await supabase
      .from('ventas')
      .update({ estado: nuevoEstado })
      .eq('id_venta', idVenta);

    if (error) throw error;
    await loadSales();
    if (currentUser) await loadMySales();
  } catch (err) {
    console.error('Error al actualizar estado de venta:', err);
    alert(`No se pudo actualizar el estado: ${err.message}`);
  }
}

// ------------------------------------------------------------------
// 9. Inventario: stock visible/editable y alta de productos nuevos (solo ADMIN)
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
  if (!isAdminUser()) {
    if (body) body.innerHTML = '<tr><td colspan="5" class="empty-cart">Acceso restringido a administradores.</td></tr>';
    return;
  }

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

  if (!isAdminUser()) {
    body.innerHTML = '';
    return;
  }

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
  if (!isAdminUser()) return;
  const item = inventory.find(i => String(i.id_componente) === String(idComponente));
  if (!item || !rowEl) return;

  const precioRaw = rowEl.querySelector('[data-field="precio"]').value.trim();
  const stockRaw = rowEl.querySelector('[data-field="stock"]').value.trim();
  const activo = rowEl.querySelector('[data-field="activo"]').checked;
  const precio = Number(precioRaw);
  const stock = Number(stockRaw);

  if (precioRaw === '' || stockRaw === '' || !Number.isFinite(precio) || precio < 0 || !Number.isInteger(stock) || stock < 0) {
    setInventoryFeedback('Verifica que el precio sea mayor o igual a 0 y el stock un entero mayor o igual a 0.', 'error');
    return;
  }

  try {
    buttonEl.disabled = true;
    buttonEl.textContent = '...';
    setInventoryFeedback('');

    const { error } = await supabase
      .from('componentes')
      .update({ precio, stock, activo })
      .eq('id_componente', idComponente);

    if (error) throw error;

    setInventoryFeedback(`Cambios guardados en ${item.marca} ${item.modelo}.`, 'ok');
    await Promise.all([loadInventory(), loadProducts()]);
  } catch (err) {
    console.error('Error al actualizar componente:', err);
    setInventoryFeedback(`No se pudo guardar: ${err.message}`, 'error');
  } finally {
    buttonEl.disabled = false;
    buttonEl.textContent = 'Guardar';
  }
}

async function handleCreateProduct(event) {
  event.preventDefault();
  if (!isAdminUser()) return;
  const submitBtn = document.querySelector('#save-product-btn');

  const tipo = document.querySelector('#product-type').value;
  const marca = document.querySelector('#product-brand').value.trim();
  const modelo = document.querySelector('#product-model').value.trim();
  const precio = Number(document.querySelector('#product-price').value);
  const stock = Number(document.querySelector('#product-stock').value);
  const badge = document.querySelector('#product-badge').value.trim() || null;
  const image_url = document.querySelector('#product-image').value.trim() || null;
  const descripcion = document.querySelector('#product-description').value.trim() || null;
  const activo = document.querySelector('#product-active').checked;
  const best_seller = document.querySelector('#product-best').checked;
  const controla_serie = document.querySelector('#product-serial').checked;

  if (!marca || !modelo || !Number.isFinite(precio) || precio < 0 || !Number.isInteger(stock) || stock < 0) {
    setFeedback('#product-feedback', 'Completa los campos obligatorios con valores válidos.', 'error');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
    setFeedback('#product-feedback', 'Guardando producto en Supabase...');

    const { error } = await supabase
      .from('componentes')
      .insert({
        tipo,
        marca,
        modelo,
        precio,
        stock,
        badge,
        image_url,
        descripcion,
        activo,
        best_seller,
        controla_serie
      });

    if (error) throw error;

    document.querySelector('#product-form').reset();
    document.querySelector('#product-active').checked = true;
    setFeedback('#product-feedback', `✓ Producto "${marca} ${modelo}" guardado.`, 'ok');

    await Promise.all([loadInventory(), loadProducts()]);
  } catch (err) {
    console.error('Error al crear producto:', err);
    setFeedback('#product-feedback', `Error al guardar: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '✓ Guardar producto';
  }
}

// ------------------------------------------------------------------
// 10. Cuenta de Usuario: Registro, Login, Sesión, Compras y Admin
// ------------------------------------------------------------------
function setAccountFeedback(selector, message, kind = '') {
  const el = document.querySelector(selector);
  if (!el) return;
  el.textContent = message;
  el.style.color = kind === 'ok' ? '#16a34a' : kind === 'error' ? '#dc2626' : '#0869e8';
}

function saveUserSession(user) {
  currentUser = user ? { ...user, rol: String(user.rol || 'CLIENTE').toUpperCase() } : null;
  try {
    if (currentUser) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('No se pudo guardar la sesión en localStorage:', err);
  }
  updateAccountHeaderUI();
}

function restoreUserSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id_usuario && parsed.correo) {
      currentUser = {
        ...parsed,
        rol: String(parsed.rol || 'CLIENTE').toUpperCase()
      };
      updateAccountHeaderUI();
    }
  } catch (err) {
    console.warn('Sesión guardada inválida, limpiando...', err);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function updateAccountHeaderUI() {
  const labelEl = document.querySelector('#account-label');
  const sublabelEl = document.querySelector('#account-sublabel');
  const authBox = document.querySelector('#account-auth-box');
  const sessionBox = document.querySelector('#account-session-box');
  const titleEl = document.querySelector('#account-dialog-title');
  const sessionName = document.querySelector('#session-user-name');
  const sessionEmail = document.querySelector('#session-user-email');
  const invBtn = document.querySelector('#open-inventory-btn');
  const salesBtn = document.querySelector('#open-sales-btn');
  const adminPanel = document.querySelector('#admin-users-panel');

  const adminActive = isAdminUser();

  if (invBtn) invBtn.style.display = adminActive ? '' : 'none';
  if (salesBtn) salesBtn.style.display = adminActive ? '' : 'none';

  if (currentUser) {
    const role = String(currentUser.rol || 'CLIENTE').toUpperCase();
    if (labelEl) labelEl.textContent = currentUser.nombre.split(' ')[0] || 'Mi cuenta';
    if (sublabelEl) sublabelEl.textContent = `${role} · ${currentUser.num_cliente || 'Sesión activa'}`;
    if (authBox) authBox.style.display = 'none';
    if (sessionBox) sessionBox.style.display = 'block';
    if (titleEl) titleEl.textContent = `Mi cuenta (${role})`;
    if (sessionName) sessionName.textContent = `${currentUser.nombre} [${role}]`;
    if (sessionEmail) sessionEmail.textContent = `${currentUser.correo}${currentUser.numero_tel ? ' · ' + currentUser.numero_tel : ''}`;

    if (adminPanel) {
      adminPanel.style.display = adminActive ? 'block' : 'none';
    }

    const profilePhone = document.querySelector('#profile-phone');
    const profileAddress = document.querySelector('#profile-address');
    if (profilePhone) profilePhone.value = currentUser.numero_tel || '';
    if (profileAddress) profileAddress.value = currentUser.direccion || '';
    setAccountFeedback('#profile-edit-feedback', '');

    const saleEmail = document.querySelector('#sale-email');
    const saleName = document.querySelector('#sale-name');
    const salePhone = document.querySelector('#sale-phone');
    const saleAddress = document.querySelector('#sale-address');
    if (saleEmail && !saleEmail.value) saleEmail.value = currentUser.correo || '';
    if (saleName && !saleName.value) saleName.value = currentUser.nombre || '';
    if (salePhone && !salePhone.value) salePhone.value = currentUser.numero_tel || '';
    if (saleAddress && !saleAddress.value) saleAddress.value = currentUser.direccion || '';

    loadMySales();
    if (adminActive) {
      loadUsersList();
    } else {
      allUsers = [];
      const usersListEl = document.querySelector('#users-list');
      if (usersListEl) usersListEl.innerHTML = '';
    }
  } else {
    if (labelEl) labelEl.textContent = 'Mi cuenta';
    if (sublabelEl) sublabelEl.textContent = 'Iniciar sesión';
    if (authBox) authBox.style.display = 'block';
    if (sessionBox) sessionBox.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'none';
    switchAccountTab('register');

    const checkoutForm = document.querySelector('#checkout-form');
    if (checkoutForm) checkoutForm.reset();

    const passForm = document.querySelector('#password-change-form');
    if (passForm) passForm.reset();
    const passDetails = document.querySelector('#password-change-details');
    if (passDetails) passDetails.open = false;
    setAccountFeedback('#password-change-feedback', '');

    const mySalesEl = document.querySelector('#my-sales-list');
    if (mySalesEl) mySalesEl.innerHTML = '';

    allUsers = [];
    const usersListEl = document.querySelector('#users-list');
    if (usersListEl) usersListEl.innerHTML = '';
  }
}

function switchAccountTab(mode) {
  const regForm = document.querySelector('#register-form');
  const loginForm = document.querySelector('#login-form');
  const titleEl = document.querySelector('#account-dialog-title');
  const guideEl = document.querySelector('#account-guide');
  const tabReg = document.querySelector('#tab-register-btn');
  const tabLogin = document.querySelector('#tab-login-btn');

  setAccountFeedback('#register-feedback', '');
  setAccountFeedback('#login-feedback', '');

  if (mode === 'login') {
    if (regForm) regForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'flex';
    if (titleEl) titleEl.textContent = 'Iniciar sesión';
    if (guideEl) guideEl.textContent = 'Ingresa tu correo registrado y tu contraseña para acceder a tu cuenta.';
    if (tabLogin) {
      tabLogin.className = 'primary-button';
      tabLogin.style.background = '';
      tabLogin.style.color = '#fff';
    }
    if (tabReg) {
      tabReg.className = 'small-button';
      tabReg.style.background = '#e2e8f0';
      tabReg.style.color = '#0f172a';
    }
  } else {
    if (loginForm) loginForm.style.display = 'none';
    if (regForm) regForm.style.display = 'flex';
    if (titleEl) titleEl.textContent = 'Registro de usuario';
    if (guideEl) guideEl.textContent = 'Completa tus datos para crear tu cuenta en Tecnoli. Todos los campos marcados con * son obligatorios.';
    if (tabReg) {
      tabReg.className = 'primary-button';
      tabReg.style.background = '';
      tabReg.style.color = '#fff';
    }
    if (tabLogin) {
      tabLogin.className = 'small-button';
      tabLogin.style.background = '#e2e8f0';
      tabLogin.style.color = '#0f172a';
    }
  }
}

async function handleRegisterUser(event) {
  event.preventDefault();
  const submitBtn = document.querySelector('#register-submit-btn');

  const nombre = document.querySelector('#reg-name')?.value.trim() || '';
  const correo = document.querySelector('#reg-email')?.value.trim().toLowerCase() || '';
  const numero_tel = document.querySelector('#reg-phone')?.value.trim() || '';
  const password = document.querySelector('#reg-password')?.value || '';
  const direccion = document.querySelector('#reg-address')?.value.trim() || null;

  if (!nombre || !correo || !numero_tel || !password) {
    setAccountFeedback('#register-feedback', 'Por favor completa todos los campos obligatorios (*): nombre, correo, teléfono y contraseña.', 'error');
    return;
  }

  if (!isValidEmail(correo)) {
    setAccountFeedback('#register-feedback', 'El formato del correo electrónico no es válido (ej. nombre@dominio.com).', 'error');
    return;
  }

  if (!isValidPhone(numero_tel)) {
    setAccountFeedback('#register-feedback', 'Ingresa un número de teléfono válido (entre 7 y 15 dígitos).', 'error');
    return;
  }

  if (password.length < 6) {
    setAccountFeedback('#register-feedback', 'La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registrando...';
    setAccountFeedback('#register-feedback', 'Validando disponibilidad del correo y guardando usuario...', 'info');

    const { data: existing, error: checkError } = await supabase
      .from('usuarios')
      .select('id_usuario')
      .eq('correo', correo)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      setAccountFeedback('#register-feedback', 'Este correo electrónico ya está registrado. Intenta iniciar sesión o usa otro correo.', 'error');
      return;
    }

    const passwordHash = await hashPasswordSHA256(password);
    const numCliente = `CLI-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;

    const { data: created, error: insertError } = await supabase
      .from('usuarios')
      .insert({
        num_cliente: numCliente,
        nombre,
        correo,
        numero_tel,
        password_hash: passwordHash,
        direccion,
        rol: 'CLIENTE'
      })
      .select('id_usuario, num_cliente, nombre, correo, numero_tel, direccion, rol')
      .single();

    if (insertError) throw insertError;

    saveUserSession(created);
    document.querySelector('#register-form')?.reset();
    setAccountFeedback('#register-feedback', `✓ Registro completado con éxito. ¡Bienvenido/a, ${created.nombre} (${created.num_cliente})!`, 'ok');
  } catch (err) {
    console.error('Error al registrar usuario:', err);
    setAccountFeedback('#register-feedback', `No se pudo completar el registro: ${err.message || 'Verifica políticas RLS en usuarios.'}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '✓ Crear cuenta';
  }
}

async function handleLoginUser(event) {
  event.preventDefault();
  const submitBtn = document.querySelector('#login-submit-btn');

  const correo = document.querySelector('#login-email')?.value.trim().toLowerCase() || '';
  const password = document.querySelector('#login-password')?.value || '';

  if (!correo || !password) {
    setAccountFeedback('#login-feedback', 'Ingresa tu correo y contraseña.', 'error');
    return;
  }

  if (!isValidEmail(correo)) {
    setAccountFeedback('#login-feedback', 'El formato del correo electrónico no es válido.', 'error');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';
    setAccountFeedback('#login-feedback', 'Consultando cuenta...', 'info');

    const passwordHash = await hashPasswordSHA256(password);

    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id_usuario, num_cliente, nombre, correo, numero_tel, direccion, rol, password_hash')
      .eq('correo', correo)
      .maybeSingle();

    if (error) throw error;

    if (!user || user.password_hash !== passwordHash) {
      setAccountFeedback('#login-feedback', 'Correo o contraseña incorrectos.', 'error');
      return;
    }

    const { password_hash, ...safeUser } = user;
    saveUserSession({ ...safeUser, rol: safeUser.rol || 'CLIENTE' });
    document.querySelector('#login-form')?.reset();
    setAccountFeedback('#login-feedback', `✓ Sesión iniciada como ${safeUser.nombre}.`, 'ok');
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    setAccountFeedback('#login-feedback', `Error al iniciar sesión: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '→ Iniciar sesión';
  }
}

async function loadUsersList() {
  const listEl = document.querySelector('#users-list');
  if (!listEl) return;

  if (!isAdminUser()) {
    listEl.innerHTML = '<p class="empty-cart" style="padding: 8px 0; font-size: 11px;">Acceso restringido a administradores.</p>';
    return;
  }

  listEl.innerHTML = '<p class="empty-cart" style="padding: 8px 0; font-size: 11px;">Consultando usuarios...</p>';

  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id_usuario, num_cliente, nombre, correo, numero_tel, direccion, rol')
      .order('id_usuario', { ascending: false });

    if (error) throw error;

    allUsers = data || [];
    renderUsersList();
  } catch (err) {
    console.error('Error al cargar usuarios:', err);
    listEl.innerHTML = `<p class="empty-cart" style="padding: 8px 0; font-size: 11px; color: #dc2626;">Error al cargar usuarios: ${escapeHTML(err.message)}</p>`;
  }
}

function renderUsersList() {
  const listEl = document.querySelector('#users-list');
  if (!listEl) return;

  if (!isAdminUser()) {
    listEl.innerHTML = '';
    return;
  }

  const query = normalizeText(document.querySelector('#users-search')?.value || '');
  const roleFilter = document.querySelector('#users-filter-role')?.value || 'TODOS';

  const filtered = allUsers.filter(u => {
    const role = String(u.rol || 'CLIENTE').toUpperCase();
    const matchesRole = roleFilter === 'TODOS' || role === roleFilter;
    const haystack = normalizeText(`${u.nombre || ''} ${u.correo || ''} ${u.num_cliente || ''}`);
    const matchesQuery = !query || haystack.includes(query);
    return matchesRole && matchesQuery;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-cart" style="padding: 8px 0; font-size: 11px;">No hay usuarios con los filtros actuales.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(u => {
    const role = String(u.rol || 'CLIENTE').toUpperCase();
    const badgeStyle = role === 'ADMIN'
      ? 'background:#dbeafe; color:#1e40af; border:1px solid #93c5fd;'
      : 'background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;';

    return `
      <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
          <strong style="color: #0f172a;">${escapeHTML(u.nombre || 'Sin nombre')}</strong>
          <span style="padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; ${badgeStyle}">${escapeHTML(role)}</span>
        </div>
        <div style="color: #475569; margin-top: 2px;">${escapeHTML(u.correo || '')}${u.numero_tel ? ' · ' + escapeHTML(u.numero_tel) : ''}</div>
        <small style="color: #64748b;">${escapeHTML(u.num_cliente || '')}</small>
      </div>`;
  }).join('');
}

async function handleAdminCreateUser(event) {
  event.preventDefault();
  if (!isAdminUser()) {
    setAccountFeedback('#admin-user-feedback', 'Solo un administrador puede crear usuarios.', 'error');
    return;
  }

  const submitBtn = document.querySelector('#admin-create-user-btn');
  const rol = String(document.querySelector('#admin-user-role')?.value || 'CLIENTE').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'CLIENTE';
  const nombre = document.querySelector('#admin-user-name')?.value.trim() || '';
  const correo = document.querySelector('#admin-user-email')?.value.trim().toLowerCase() || '';
  const numero_tel = document.querySelector('#admin-user-phone')?.value.trim() || '';
  const password = document.querySelector('#admin-user-password')?.value || '';
  const direccion = document.querySelector('#admin-user-address')?.value.trim() || null;

  if (!nombre || !correo || !numero_tel || !password) {
    setAccountFeedback('#admin-user-feedback', 'Completa nombre, correo, teléfono y contraseña.', 'error');
    return;
  }
  if (!isValidEmail(correo)) {
    setAccountFeedback('#admin-user-feedback', 'El formato del correo electrónico no es válido.', 'error');
    return;
  }
  if (!isValidPhone(numero_tel)) {
    setAccountFeedback('#admin-user-feedback', 'Ingresa un teléfono válido (7 a 15 dígitos).', 'error');
    return;
  }
  if (password.length < 6) {
    setAccountFeedback('#admin-user-feedback', 'La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando...';
    }
    setAccountFeedback('#admin-user-feedback', 'Validando correo y guardando usuario...', 'info');

    const { data: existing, error: checkError } = await supabase
      .from('usuarios')
      .select('id_usuario')
      .eq('correo', correo)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      setAccountFeedback('#admin-user-feedback', 'Ese correo electrónico ya está registrado.', 'error');
      return;
    }

    const passwordHash = await hashPasswordSHA256(password);
    const numCliente = `CLI-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;

    const { data: created, error: insertError } = await supabase
      .from('usuarios')
      .insert({
        num_cliente: numCliente,
        nombre,
        correo,
        numero_tel,
        password_hash: passwordHash,
        direccion,
        rol
      })
      .select('id_usuario, num_cliente, nombre, correo, numero_tel, direccion, rol')
      .single();

    if (insertError) throw insertError;

    document.querySelector('#admin-create-user-form')?.reset();
    setAccountFeedback('#admin-user-feedback', `✓ Usuario ${created.nombre} (${created.rol}) creado.`, 'ok');
    await loadUsersList();
  } catch (err) {
    console.error('Error al crear usuario desde admin:', err);
    setAccountFeedback('#admin-user-feedback', `Error al crear usuario: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Crear usuario';
    }
  }
}

async function handleUpdateProfile(event) {
  event.preventDefault();
  if (!currentUser?.id_usuario) return;

  const submitBtn = document.querySelector('#save-profile-btn');
  const numero_tel = document.querySelector('#profile-phone')?.value.trim() || '';
  const direccion = document.querySelector('#profile-address')?.value.trim() || null;

  if (!numero_tel) {
    setAccountFeedback('#profile-edit-feedback', 'El número de teléfono es obligatorio.', 'error');
    return;
  }

  if (!isValidPhone(numero_tel)) {
    setAccountFeedback('#profile-edit-feedback', 'Ingresa un número de teléfono válido (entre 7 y 15 dígitos).', 'error');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }
    setAccountFeedback('#profile-edit-feedback', 'Actualizando datos...', 'info');

    const { data: updated, error } = await supabase
      .from('usuarios')
      .update({ numero_tel, direccion })
      .eq('id_usuario', currentUser.id_usuario)
      .select('id_usuario, num_cliente, nombre, correo, numero_tel, direccion, rol')
      .single();

    if (error) throw error;

    saveUserSession(updated);

    const salePhone = document.querySelector('#sale-phone');
    const saleAddress = document.querySelector('#sale-address');
    if (salePhone) salePhone.value = updated.numero_tel || '';
    if (saleAddress) saleAddress.value = updated.direccion || '';

    setAccountFeedback('#profile-edit-feedback', '✓ Datos actualizados correctamente.', 'ok');
  } catch (err) {
    console.error('Error al actualizar perfil:', err);
    setAccountFeedback('#profile-edit-feedback', `No se pudieron guardar los cambios: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Guardar cambios';
    }
  }
}

async function handleChangePassword(event) {
  event.preventDefault();
  if (!currentUser?.id_usuario) return;

  const submitBtn = document.querySelector('#save-password-btn');
  const currentPassword = document.querySelector('#current-password')?.value || '';
  const newPassword = document.querySelector('#new-password')?.value || '';
  const confirmPassword = document.querySelector('#confirm-new-password')?.value || '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    setAccountFeedback('#password-change-feedback', 'Completa todos los campos de contraseña.', 'error');
    return;
  }

  if (newPassword.length < 6) {
    setAccountFeedback('#password-change-feedback', 'La nueva contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    setAccountFeedback('#password-change-feedback', 'La nueva contraseña y su confirmación no coinciden.', 'error');
    return;
  }

  if (currentPassword === newPassword) {
    setAccountFeedback('#password-change-feedback', 'La nueva contraseña debe ser diferente a la actual.', 'error');
    return;
  }

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verificando...';
    }
    setAccountFeedback('#password-change-feedback', 'Verificando contraseña actual...', 'info');

    const currentHash = await hashPasswordSHA256(currentPassword);

    const { data: userRow, error: fetchError } = await supabase
      .from('usuarios')
      .select('password_hash')
      .eq('id_usuario', currentUser.id_usuario)
      .single();

    if (fetchError) throw fetchError;

    if (!userRow || userRow.password_hash !== currentHash) {
      setAccountFeedback('#password-change-feedback', 'La contraseña actual es incorrecta.', 'error');
      return;
    }

    const newHash = await hashPasswordSHA256(newPassword);

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ password_hash: newHash })
      .eq('id_usuario', currentUser.id_usuario);

    if (updateError) throw updateError;

    document.querySelector('#password-change-form')?.reset();
    setAccountFeedback('#password-change-feedback', '✓ Contraseña actualizada correctamente.', 'ok');
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    setAccountFeedback('#password-change-feedback', `No se pudo actualizar la contraseña: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Actualizar contraseña';
    }
  }
}

async function loadMySales() {
  const listEl = document.querySelector('#my-sales-list');
  if (!listEl) return;

  if (!currentUser?.id_usuario) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = '<p class="empty-cart" style="padding: 10px 0; font-size: 11px;">Consultando tus compras...</p>';

  try {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        id_venta,
        folio_venta,
        fecha_venta,
        total,
        estado,
        detalle_venta (
          cantidad,
          precio_unitario,
          componentes (
            marca,
            modelo
          )
        )
      `)
      .eq('id_usuario', currentUser.id_usuario)
      .order('fecha_venta', { ascending: false });

    if (error) throw error;

    const mySales = data || [];
    if (mySales.length === 0) {
      listEl.innerHTML = '<p class="empty-cart" style="padding: 10px 0; font-size: 11px;">Aún no tienes compras registradas con esta cuenta.</p>';
      return;
    }

    listEl.innerHTML = mySales.map(sale => {
      const detalles = sale.detalle_venta || [];
      const itemsHTML = detalles.map(det => {
        const comp = det.componentes || {};
        const subtotal = Number(det.cantidad) * Number(det.precio_unitario);
        return `
          <li style="display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; border-bottom: 1px dashed #e2e8f0;">
            <span><strong>${escapeHTML(det.cantidad)}x</strong> ${escapeHTML(comp.marca || '')} ${escapeHTML(comp.modelo || 'Componente')}</span>
            <span>${money.format(subtotal)}</span>
          </li>`;
      }).join('');

      return `
        <article style="background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 4px;">
            <strong style="font-size: 11px; color: #0f172a;">${escapeHTML(sale.folio_venta)}</strong>
            <span style="padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; ${saleStatusBadgeStyle(sale.estado)}">${escapeHTML(sale.estado)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-bottom: 6px;">
            <span>${formatDate(sale.fecha_venta)}</span>
            <strong style="color: #0869e8;">${money.format(Number(sale.total || 0))} MXN</strong>
          </div>
          <details>
            <summary style="cursor: pointer; font-size: 11px; font-weight: 600; color: #334155;">
              Ver ${detalles.length} artículo(s)
            </summary>
            <ul style="list-style: none; padding: 4px 0 0; margin: 0;">
              ${itemsHTML || '<li style="font-size: 11px; color: #64748b;">Sin detalle registrado.</li>'}
            </ul>
          </details>
        </article>`;
    }).join('');
  } catch (err) {
    console.error('Error al cargar compras del usuario:', err);
    listEl.innerHTML = `<p class="empty-cart" style="padding: 10px 0; font-size: 11px; color: #dc2626;">Error al cargar tus compras: ${escapeHTML(err.message)}</p>`;
  }
}

// ------------------------------------------------------------------
// 11. Armador de PC (Drag & Drop + 3D + Resumen)
// ------------------------------------------------------------------
function slotPlaceholderText(slotType) {
  const shortMap = {
    'CPU': 'Arrastra CPU aquí',
    'GPU': 'Arrastra GPU aquí',
    'Motherboard': 'Arrastra Motherboard aquí',
    'RAM': 'Arrastra RAM aquí',
    'fuente de poder': 'Arrastra Fuente aquí',
    'almacenamiento': 'Arrastra Disco aquí',
    'gabinete': 'Arrastra Gabinete aquí',
    'refrigeracion': 'Arrastra Cooler aquí'
  };
  return shortMap[slotType] || 'Arrastra aquí';
}

function setBuilderSlot(slotType, product) {
  const slotEl = document.querySelector(`.drop-slot[data-slot="${slotType}"]`);
  if (!slotEl) return;

  const contentEl = slotEl.querySelector('.slot-content');
  if (product) {
    builderSetup.set(slotType, product);
    slotEl.classList.add('filled');
    contentEl.innerHTML = `
      <div class="slotted-item">
        <strong>${escapeHTML(product.marca)} ${escapeHTML(product.modelo)}</strong>
        <button type="button" class="remove-slotted" data-remove-slot="${escapeHTML(slotType)}" title="Quitar">×</button>
      </div>`;
  } else {
    builderSetup.delete(slotType);
    slotEl.classList.remove('filled');
    contentEl.textContent = slotPlaceholderText(slotType);
  }

  update3DPiece(slotType, product || null);
  updateBuilderSummary();
}

function handleDropOnSlot(slotType, productId) {
  const product = products.find(p => String(p.id_componente) === String(productId));
  if (!product) return;

  if (canonicalType(product.tipo) !== canonicalType(slotType)) {
    alert(`Este componente es de tipo "${product.tipo}" y no corresponde a la casilla "${slotType}".`);
    return;
  }

  setBuilderSlot(slotType, product);
}

function updateBuilderSummary() {
  const detailsEl = document.querySelector('#builder-details');
  const totalEl = document.querySelector('#builder-total-price');
  const items = [...builderSetup.values()];

  const total = items.reduce((sum, p) => sum + Number(p.precio || 0), 0);
  if (totalEl) totalEl.textContent = `${money.format(total)} MXN`;

  if (!detailsEl) return;

  if (items.length === 0) {
    detailsEl.innerHTML = '<p class="empty-summary">Arrastra componentes hacia las casillas superiores para analizar las capacidades del equipo.</p>';
    return;
  }

  const missing = COMPONENT_TYPES
    .filter(t => !builderSetup.has(t.value))
    .map(t => t.short);

  const hasCpu = builderSetup.has('CPU');
  const hasGpu = builderSetup.has('GPU');
  const profileBadge = hasCpu && hasGpu
    ? '<span class="performance-badge">Perfil Gaming / Trabajo</span>'
    : '<span class="performance-badge">Configuración en progreso</span>';

  const statusLine = missing.length === 0
    ? '<p class="complete-parts">✓ Equipo completo (8/8 componentes).</p>'
    : `<p class="missing-parts">Faltan (${missing.length}): ${escapeHTML(missing.join(', '))}</p>`;

  detailsEl.innerHTML = `
    ${profileBadge}
    <p>Componentes seleccionados: <strong>${items.length} / ${COMPONENT_TYPES.length}</strong></p>
    ${statusLine}`;
}

function addBuilderToCart() {
  const items = [...builderSetup.values()];
  if (items.length === 0) {
    alert('Primero agrega al menos un componente al armador de PC.');
    return;
  }

  for (const product of items) {
    addToCart(product.id_componente);
  }

  const cartDialog = document.querySelector('#cart-dialog');
  if (cartDialog && !cartDialog.open) cartDialog.showModal();
}

// ------------------------------------------------------------------
// 12. Búsqueda y Eventos Globales
// ------------------------------------------------------------------
function filterCatalog(term) {
  const q = normalizeText(term);
  const statusEl = getStatusMessage();

  if (!q) {
    renderProducts(products);
    if (statusEl && products.length) {
      statusEl.textContent = `Catálogo cargado (${products.length} componentes disponibles).`;
    }
    return;
  }

  const matches = products.filter(p =>
    normalizeText(`${p.marca} ${p.modelo} ${p.tipo} ${p.descripcion || ''}`).includes(q)
  );

  renderProducts(matches);
  if (statusEl) {
    statusEl.textContent = matches.length
      ? `Mostrando ${matches.length} resultado(s) para "${term}".`
      : `Sin resultados para "${term}".`;
  }
}

function initEvents() {
  const yearEl = document.querySelector('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  document.addEventListener('click', event => {
    const addBtn = event.target.closest('[data-add]');
    if (addBtn) {
      addToCart(addBtn.dataset.add);
      return;
    }

    const cartBtn = event.target.closest('[data-cart-action]');
    if (cartBtn) {
      handleCartAction(cartBtn.dataset.cartAction, cartBtn.dataset.id);
      return;
    }

    const removeSlotBtn = event.target.closest('[data-remove-slot]');
    if (removeSlotBtn) {
      setBuilderSlot(removeSlotBtn.dataset.removeSlot, null);
      return;
    }

    const saleStatusBtn = event.target.closest('[data-sale-id][data-sale-status]');
    if (saleStatusBtn) {
      updateSaleStatus(saleStatusBtn.dataset.saleId, saleStatusBtn.dataset.saleStatus);
      return;
    }

    const invSaveBtn = event.target.closest('[data-inv-save]');
    if (invSaveBtn) {
      const row = invSaveBtn.closest('tr');
      saveInventoryRow(invSaveBtn.dataset.invSave, row, invSaveBtn);
    }
  });

  document.addEventListener('dragstart', event => {
    const card = event.target.closest('.product-card[draggable="true"]');
    if (!card) return;
    event.dataTransfer.setData('text/plain', card.dataset.dragId);
    event.dataTransfer.effectAllowed = 'copy';
   });
  // Selección de método de pago
  document.querySelector('#payment-methods-grid')?.addEventListener('change', event => {
    const radio = event.target.closest('input[name="payment-method"]');
    if (radio) {
      selectPaymentMethod(radio.value);
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
    if (!selectedPaymentMethod) resetPaymentSelection();
    updateCartUI();
    document.querySelector('#cart-dialog')?.showModal();
  });

  document.querySelectorAll('.drop-slot').forEach(slot => {
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
      if (productId) handleDropOnSlot(slot.dataset.slot, productId);
    });
  });

  document.querySelector('#add-builder-to-cart')?.addEventListener('click', addBuilderToCart);

  const searchForm = document.querySelector('#search-form');
  const searchInput = document.querySelector('#search-input');
  searchForm?.addEventListener('submit', e => {
    e.preventDefault();
    filterCatalog(searchInput?.value || '');
  });
  searchInput?.addEventListener('input', e => {
    filterCatalog(e.target.value);
  });

  // Carrito
  const cartDialog = document.querySelector('#cart-dialog');
  document.querySelector('#cart-button')?.addEventListener('click', () => cartDialog?.showModal());
  document.querySelector('#close-cart')?.addEventListener('click', () => {
    resetClearCartButton();
    cartDialog?.close();
  });
  document.querySelector('#clear-cart-btn')?.addEventListener('click', clearCart);
  document.querySelector('#checkout-form')?.addEventListener('submit', handleRegisterSale);

  // Ventas (solo ADMIN)
  const salesDialog = document.querySelector('#sales-dialog');
  document.querySelector('#open-sales-btn')?.addEventListener('click', () => {
    if (!isAdminUser()) return;
    salesDialog?.showModal();
    loadSales();
  });
  document.querySelector('#close-sales')?.addEventListener('click', () => salesDialog?.close());
  document.querySelector('#refresh-sales-btn')?.addEventListener('click', loadSales);
  document.querySelector('#sales-search')?.addEventListener('input', renderSalesList);
  document.querySelector('#sales-filter-status')?.addEventListener('change', renderSalesList);
  document.querySelector('#sales-filter-payment')?.addEventListener('change', renderSalesList);

  // Inventario (solo ADMIN)
  const invDialog = document.querySelector('#inventory-dialog');
  document.querySelector('#open-inventory-btn')?.addEventListener('click', () => {
    if (!isAdminUser()) return;
    invDialog?.showModal();
    loadInventory();
  });
  document.querySelector('#close-inventory')?.addEventListener('click', () => invDialog?.close());
  document.querySelector('#refresh-inventory-btn')?.addEventListener('click', loadInventory);
  document.querySelector('#inventory-search')?.addEventListener('input', renderInventory);
  document.querySelector('#inventory-filter-type')?.addEventListener('change', renderInventory);
  document.querySelector('#inventory-only-low')?.addEventListener('change', renderInventory);
  document.querySelector('#product-form')?.addEventListener('submit', handleCreateProduct);

  // Cuenta de usuario
  const accountDialog = document.querySelector('#account-dialog');
  document.querySelector('#open-account-btn')?.addEventListener('click', () => {
    if (currentUser) {
      loadMySales();
      if (isAdminUser()) loadUsersList();
    } else {
      switchAccountTab('register');
    }
    accountDialog?.showModal();
  });
  document.querySelector('#close-account')?.addEventListener('click', () => accountDialog?.close());
  document.querySelector('#tab-register-btn')?.addEventListener('click', () => switchAccountTab('register'));
  document.querySelector('#tab-login-btn')?.addEventListener('click', () => switchAccountTab('login'));
  document.querySelector('#register-form')?.addEventListener('submit', handleRegisterUser);
  document.querySelector('#login-form')?.addEventListener('submit', handleLoginUser);
  document.querySelector('#profile-edit-form')?.addEventListener('submit', handleUpdateProfile);
  document.querySelector('#password-change-form')?.addEventListener('submit', handleChangePassword);
  document.querySelector('#refresh-my-sales-btn')?.addEventListener('click', loadMySales);
  document.querySelector('#admin-create-user-form')?.addEventListener('submit', handleAdminCreateUser);
  document.querySelector('#refresh-users-btn')?.addEventListener('click', loadUsersList);
  document.querySelector('#users-search')?.addEventListener('input', renderUsersList);
  document.querySelector('#users-filter-role')?.addEventListener('change', renderUsersList);
  document.querySelector('#logout-btn')?.addEventListener('click', () => {
    saveUserSession(null);
    setAccountFeedback('#register-feedback', 'Sesión cerrada.', 'info');
  });
}

// ------------------------------------------------------------------
// 13. Arranque
// ------------------------------------------------------------------
populateTypeSelects();
updateCartUI();
updateBuilderSummary();
initEvents();
restoreUserSession();
init3DCase('case-3d-container');
loadProducts();