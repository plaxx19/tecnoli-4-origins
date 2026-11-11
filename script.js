
// Importación nativa mediante CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuración de Supabase
const SUPABASE_URL = "https://ibfkdbuahvbzhoqigeii.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RUq18PkAFzxMwUqzdmdamg_qQb2j6ky";

const isSupabaseConfigured = 
  SUPABASE_URL !== 'HTTPS://TU-PROYECTO.supabase.co' && 
  SUPABASE_ANON_KEY !== 'TU_SUPABASE_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
});

let products = [];
const cart = new Map();

const bestContainer = document.querySelector('#best-products');
const statusMessage = document.querySelector('#status-message');

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
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

function renderBestSeller(product) {
  const displayName = `${product.marca} ${product.modelo}`;
  const badge = product.badge
    ? `<span class="badge ${badgeClass(product.badge)}">${escapeHTML(product.badge)}</span>`
    : '';
  return `
    <article class="product-card best-card">
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
    <article class="product-card mini-card">
      ${productImage(product)}
      <h3 class="product-name">${escapeHTML(displayName)}</h3>
      <p class="product-price">${money.format(Number(product.precio) || 0)} MXN</p>
      <button class="add-button mini-add" data-add="${escapeHTML(product.id_componente)}" type="button">Agregar</button>
    </article>`;
}

function normalizeText(text = '') {
    return String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Elimina acentos
      .trim()
      .toLowerCase();
  }
  
  function renderProducts(list) {
    const best = list.filter(p => p.best_seller || p.badge).slice(0, 5);
    const fallbackBest = best.length ? best : list.slice(0, 5);
    
    bestContainer.innerHTML = fallbackBest.length
      ? fallbackBest.map(renderBestSeller).join('')
      : `<p class="empty-cart">No hay componentes disponibles.</p>`;
  
    document.querySelectorAll('.mini-grid').forEach(grid => {
      const rawCategory = grid.dataset.category;
      const categoryTarget = normalizeText(rawCategory);
  
      // Compara el tipo del componente con la categoría del HTML sin importar tildes o mayúsculas
      const categoryProducts = list.filter(p => normalizeText(p.tipo) === categoryTarget).slice(0, 3);
  
      grid.innerHTML = categoryProducts.length
        ? categoryProducts.map(renderMiniProduct).join('')
        : `<p class="empty-cart">Sin componentes</p>`;
    });
  }

async function loadProducts() {
  statusMessage.textContent = 'Cargando catálogo desde Supabase…';

  if (!isSupabaseConfigured) {
    statusMessage.textContent = 'Por favor ingresa tus credenciales SUPABASE_URL y SUPABASE_ANON_KEY en app.js.';
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
    statusMessage.textContent = products.length 
      ? `Catálogo cargado (${products.length} componentes disponibles).` 
      : 'No hay componentes activos en el inventario.';
    renderProducts(products);
  } catch (err) {
    console.error('Error al conectar con Supabase:', err);
    statusMessage.textContent = 'Error al obtener datos de Supabase. Revisa la consola y las políticas RLS.';
    renderProducts([]);
  }
}

function addToCart(productId) {
  const product = products.find(p => String(p.id_componente) === String(productId));
  if (!product) return;
  
  const current = cart.get(productId);
  const currentQty = current?.quantity || 0;

  if (currentQty + 1 > product.stock) {
    alert(`Solo hay ${product.stock} unidades disponibles en stock de este componente.`);
    return;
  }

  cart.set(productId, { product, quantity: currentQty + 1 });
  updateCartUI();
}

function updateCartUI() {
  const entries = [...cart.values()];
  const quantity = entries.reduce((sum, item) => sum + item.quantity, 0);
  const total = entries.reduce((sum, item) => sum + Number(item.product.precio) * item.quantity, 0);

  document.querySelector('#cart-count').textContent = quantity;
  document.querySelector('#cart-total').textContent = money.format(total);
  document.querySelector('#dialog-total').textContent = money.format(total);
  
  document.querySelector('#cart-items').innerHTML = entries.length
    ? entries.map(({ product, quantity: qty }) => {
        const displayName = `${product.marca} ${product.modelo}`;
        return `
          <div class="cart-line">
            <span>${escapeHTML(displayName)}<small>Cantidad: ${qty} (Precio unitario: ${money.format(product.precio)})</small></span>
            <strong>${money.format(Number(product.precio) * qty)}</strong>
          </div>`;
      }).join('')
    : `<p class="empty-cart">Tu carrito está vacío.</p>`;
}

document.addEventListener('click', event => {
  const addButton = event.target.closest('[data-add]');
  if (addButton) addToCart(addButton.dataset.add);
});

document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  const query = document.querySelector('#search-input').value.trim().toLocaleLowerCase('es-MX');
  const filtered = query
    ? products.filter(p => `${p.marca} ${p.modelo} ${p.tipo} ${p.descripcion || ''}`.toLocaleLowerCase('es-MX').includes(query))
    : products;
  renderProducts(filtered);
  statusMessage.textContent = query
    ? `${filtered.length} resultado(s) para "${query}".`
    : `Catálogo cargado (${products.length} componentes).`;
});

document.querySelector('#cart-button').addEventListener('click', () => {
  updateCartUI();
  document.querySelector('#cart-dialog').showModal();
});

document.querySelector('#close-cart').addEventListener('click', () => {
  document.querySelector('#cart-dialog').close();
});

document.querySelector('#year').textContent = new Date().getFullYear();

loadProducts();