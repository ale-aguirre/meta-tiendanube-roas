/* core — formato, estado y navegación
 *
 * Lo que usa todo el resto: formateo de números, el período seleccionado, las pestañas y los tres estados de la interfaz (cargando, error, sin datos).
 *
 * Scripts clásicos, sin bundler: se cargan en orden desde index.html y
 * comparten el mismo scope global. Cada nombre se declara una sola vez.
 */

/* Configuración que viene del servidor.
 *
 * Nombre del negocio, moneda y locale salen de /api/health, no del markup: el
 * mismo frontend tiene que servir a cualquier tienda sin editar el HTML.
 */
const CONFIG = {
  business: 'Dashboard',
  storeName: 'la tienda',
  currency: 'ARS',
  currencySymbol: '$',
  locale: 'es-AR',
  revenueLabel: 'Ingresos',
  spendLabel: 'Gasto',
  features: { inferGender: false },
  integrations: null,
  demo: false,
};

/**
 * Las cuatro integraciones, en el orden en que conviene resolverlas y con el
 * ancla del doc que explica cada una.
 *
 * `necesaria` marca las dos sin las cuales no hay ROAS: sin ellas la pantalla
 * de primeros pasos reemplaza al resumen en vez de mostrar un error.
 */
const INTEGRACIONES = [
  { clave: 'meta', titulo: 'Meta Ads', necesaria: true, doc: 'docs/setup.md#meta',
    para: 'De acá sale el gasto publicitario y las campañas.' },
  { clave: 'store', titulo: 'Tu tienda', necesaria: true, doc: 'docs/setup.md#tienda',
    para: 'De acá sale la plata que entró de verdad.' },
  { clave: 'conversionsApi', titulo: 'Conversions API', necesaria: false, doc: 'docs/webhook.md',
    para: 'Le manda a Meta las compras que el píxel del navegador pierde.' },
  { clave: 'ai', titulo: 'Análisis escrito', necesaria: false, doc: 'docs/setup.md#ia',
    para: 'Opcional. Las reglas del resumen funcionan sin esto.' },
];

/** ¿Están las dos fuentes del cruce? Sin alguna, no hay ROAS que calcular. */
function faltaLoEsencial() {
  const i = CONFIG.integrations;
  if (!i) return false;
  return INTEGRACIONES.some((x) => x.necesaria && !i[x.clave]?.configured);
}

async function cargarConfig() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return;
    const health = await res.json();
    CONFIG.business = health.business || CONFIG.business;
    CONFIG.storeName = health.integrations?.store?.name || CONFIG.storeName;
    CONFIG.currency = health.currency || CONFIG.currency;
    CONFIG.locale = health.locale || CONFIG.locale;
    CONFIG.features = health.features || CONFIG.features;
    CONFIG.integrations = health.integrations || null;
    CONFIG.demo = health.demo === true;
    CONFIG.revenueLabel = 'Ingresos ' + CONFIG.currency;
    CONFIG.spendLabel = 'Gasto ' + CONFIG.currency;
  } catch (e) {
    // El dashboard funciona igual con los valores por defecto.
  }
  aplicarConfig();
}

/** Vuelca CONFIG sobre el markup. Nada del negocio está escrito en el HTML. */
function aplicarConfig() {
  document.title = `${CONFIG.business} · ROAS real`;
  // El texto original queda guardado en el dataset: si esto vuelve a correr,
  // recalcula desde la base y no apila prefijos.
  const set = (selector, valor) => document.querySelectorAll(selector).forEach((el) => {
    if (el.dataset.base === undefined) el.dataset.base = el.textContent.trim();
    el.textContent = valor(el.dataset.base);
  });

  // Si los datos son inventados hay que decirlo en la pantalla, no solo en el
  // README: alguien puede estar mirando una demo publicada sin saberlo.
  if (CONFIG.demo && $('modoChip')) $('modoChip').textContent = 'Datos de ejemplo';

  set('[data-business-name]', () => CONFIG.business);
  set('[data-business-initial]', () => CONFIG.business.trim().charAt(0).toUpperCase());
  set('[data-store-name]', () => CONFIG.storeName);
  set('[data-currency-suffix]', (txt) => `${CONFIG.currency} ${txt}`);
  set('[data-currency-prefix]', (txt) => `${txt} ${CONFIG.currency}`);
}

const $ = id => document.getElementById(id);

function fmt(n, dec = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(CONFIG.locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pctOf(val, base) {
  if (!base) return 0;
  return Math.round((val / base) * 100);
}
function getAction(actions, types) {
  if (!actions) return 0;
  const list = Array.isArray(types) ? types : [types];
  for (const t of list) {
    const f = actions.find(a => a.action_type === t);
    if (f) return parseInt(f.value) || 0;
  }
  return 0;
}
function truncate(str, n = 40) {
  return str && str.length > n ? str.slice(0, n) + '...' : str || '';
}

// Count-up animation
function countUp(el, end, duration = 900, format = 'number') {
  if (end === 0) { el.textContent = '0'; return; }
  const startTime = performance.now();
  function update(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const current = Math.round(end * ease);
    el.textContent = format === 'currency' ? fmtARS(current) : fmt(current);
    if (p < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/**
 * Importes abreviados: $1,2M / $45K / $980.
 *
 * En un dashboard el importe exacto casi nunca es la lectura; la magnitud sí.
 * El número completo vive en el tooltip.
 */
function fmtARS(n) {
  if (!n && n !== 0) return '—';
  const s = CONFIG.currencySymbol;
  if (Math.abs(n) >= 1000000) return s + (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return s + Math.round(n / 1000) + 'K';
  return s + Math.round(n).toLocaleString(CONFIG.locale);
}

// ---- State ----
let chart = null;
let currentDatePreset = 'last_7d';
let lastMetaData = null;
let lastTNData = null;
let lastComparisonData = null;

// ---- Date pills ----
// Mostrar fecha de hoy en el header
(function() {
  const d = new Date();
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const txt = `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  const el = document.getElementById('todayDate');
  if (el) { el.innerHTML = `<svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>${txt}`; }
})();

function setDate(preset, btn) {
  currentDatePreset = preset;
  document.querySelectorAll('.date-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.preset === preset || b === btn);
  });
  loadData();
}

function switchHomeInsight(kind) {
  const isSales = kind === 'sales';
  $('homeInsightSales')?.classList.toggle('hidden', !isSales);
  $('homeInsightProducts')?.classList.toggle('hidden', isSales);
  $('homeInsightSalesBtn')?.classList.toggle('active', isSales);
  $('homeInsightProductsBtn')?.classList.toggle('active', !isSales);
}

/* ── Pestañas ─────────────────────────────────────────────────────── */

function switchTab(tab) {
  const paneles = { home: 'tabPanelHome', meta: 'tabPanelMeta', tienda: 'tabPanelTienda' };
  const botones = { home: 'tabHome', meta: 'tabMeta', tienda: 'tabTienda' };

  Object.entries(paneles).forEach(([k, id]) => $(id).classList.toggle('hidden', k !== tab));
  Object.entries(botones).forEach(([k, id]) => $(id).classList.toggle('active', k === tab));

  // Las pildoras de periodo aplican al resumen y a Meta, no a Tienda Analytics.
  $('datePillsRow').classList.toggle('hidden', tab === 'tienda');

  if (tab === 'tienda' && !tnaLoaded) loadTiendaAnalytics();
}

// ---- UI helpers ----
const KPI_IDS = ['kpiSpend','kpiPurchases','kpiCPA','kpiImpressions','kpiCTR','kpiCPM','tnRevenue','tnOrders','tnTicket','tnRoas'];
function setLoading(on) {
  const icon = $('refreshIcon');
  const btn  = $('refreshBtn');
  if (on) { icon.classList.add('spin'); btn.disabled = true; btn.style.opacity = '.6'; }
  else    { icon.classList.remove('spin'); btn.disabled = false; btn.style.opacity = '1'; }
  KPI_IDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    if (on) {
      el.dataset.prevText = el.textContent;
      el.textContent = '';
      el.classList.add('skeleton');
      el.style.display = 'inline-block';
      el.style.width = '5rem';
      el.style.height = '1.9rem';
    } else {
      el.classList.remove('skeleton');
      el.style.width = '';
      el.style.height = '';
    }
  });
}
function showError(msg) {
  $('errorBanner').classList.remove('hidden');
  $('errorMessage').textContent = msg;
}
function hideError() {
  $('errorBanner').classList.add('hidden');
}
