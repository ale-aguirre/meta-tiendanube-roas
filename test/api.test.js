'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { TtlCache } = require('../src/lib/cache');

/* ── dobles ─────────────────────────────────────────────────────────────── */

const loggerMudo = { info() {}, warn() {}, error() {}, close: async () => {} };

const ORDEN = (over = {}) => ({
  id: '1', number: '1', createdAt: '2026-08-20T14:03:11-0300', total: 1000, currency: 'ARS',
  shippingCost: 0, email: 'a@b.com', customerName: 'Ana', province: 'Córdoba',
  paymentMethod: 'credit_card', paymentMethodLabel: 'Tarjeta de crédito', coupons: [],
  products: [], ...over,
});

function storeFalso(over = {}) {
  return {
    id: 'fake', name: 'Tienda Falsa',
    isConfigured: () => true,
    listPaidOrders: async () => [ORDEN(), ORDEN({ id: '2', total: 2000 })],
    listAllPaidOrders: async () => [ORDEN()],
    listAbandonedCarts: async () => [],
    normalizeWebhook: (p) => (p && p.id ? ORDEN({ id: String(p.id) }) : null),
    verifyWebhook: () => ({ ok: true }),
    ...over,
  };
}

function metaFalso(over = {}) {
  return {
    hasToken: () => true,
    requireToken() {},
    get: async () => ({ data: [{ spend: '500', impressions: '100', clicks: '10', actions: [] }] }),
    refreshToken: async () => true,
    checkAndRefresh: async () => {},
    getAccessToken: () => 'tok',
    ...over,
  };
}

const CONFIG_BASE = {
  env: 'test',
  server: { port: 0, host: '127.0.0.1', allowedOrigins: [], openBrowser: false },
  business: { name: 'Tienda de Prueba', type: 'e-commerce', siteUrl: '', contactEmail: 'a@b.com', currency: 'ARS', locale: 'es-AR' },
  meta: { apiVersion: 'v21.0', graphHost: 'graph.facebook.com', pixelId: '', accessToken: 'tok', appId: '', appSecret: '', tokenStorePath: '', autoRefresh: false },
  store: { platform: 'fake' },
  ai: { enabled: false, apiKey: '', model: 'x', maxTokens: 10 },
  cache: { ttlMs: 60000, analyticsTtlMs: 60000 },
  features: { inferGender: false },
  paths: { publicDir: require('path').join(__dirname, '..', 'src', 'public'), credentialsDir: '', logDir: '' },
};

function levantar(over = {}) {
  const { app } = createApp({ ...CONFIG_BASE, ...(over.config || {}) }, {
    logger: loggerMudo,
    cache: new TtlCache({ ttlMs: 60000 }),
    store: over.store || storeFalso(),
    meta: over.meta || metaFalso(),
    conversions: over.conversions || { isEnabled: () => false, sendPurchase: async () => ({ skipped: true }) },
    ai: over.ai || { isEnabled: () => false, analyze: async () => { const e = new Error('sin key'); e.status = 503; throw e; } },
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({
        base,
        get: (p, o) => fetch(base + p, o),
        post: (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/* ── tests ──────────────────────────────────────────────────────────────── */

test('/api/health dice qué está configurado sin filtrar ningún secreto', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const body = await (await s.get('/api/health')).json();
  assert.equal(body.status, 'ok');
  assert.equal(body.business, 'Tienda de Prueba');
  assert.equal(body.integrations.store.name, 'Tienda Falsa');
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('tok'), 'el token no puede aparecer en la respuesta');
});

test('sin ALLOWED_ORIGINS no se emite ninguna cabecera CORS', async (t) => {
  // Con `*`, cualquier página que visite el usuario puede leer sus métricas
  // desde localhost.
  const s = await levantar();
  t.after(() => s.close());
  const res = await s.get('/api/health', { headers: { Origin: 'https://sitio-cualquiera.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('con ALLOWED_ORIGINS solo pasa el origen declarado', async (t) => {
  const config = { ...CONFIG_BASE, server: { ...CONFIG_BASE.server, allowedOrigins: ['https://permitido.example'] } };
  const s = await levantar({ config });
  t.after(() => s.close());

  const ok = await s.get('/api/health', { headers: { Origin: 'https://permitido.example' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://permitido.example');

  const no = await s.get('/api/health', { headers: { Origin: 'https://otro.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('/api/store/stats resume lo que devuelve el adaptador', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const body = await (await s.get('/api/store/stats?datePreset=last_7d')).json();
  assert.equal(body.orders, 2);
  assert.equal(body.revenue, 3000);
  assert.equal(body.avgTicket, 1500);
});

test('/api/tn sigue funcionando como alias de /api/store', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const [nuevo, viejo] = await Promise.all([
    (await s.get('/api/store/stats?datePreset=last_7d')).json(),
    (await s.get('/api/tn/stats?datePreset=last_7d')).json(),
  ]);
  assert.deepEqual(viejo, nuevo);
});

test('un período inválido devuelve 400 y no una consulta a la API', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const res = await s.get('/api/store/stats?datePreset=last_5d');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Período inválido/);
});

test('sin tienda configurada devuelve 503 con el archivo de setup en el mensaje', async (t) => {
  const s = await levantar({ store: storeFalso({ isConfigured: () => false }) });
  t.after(() => s.close());
  const res = await s.get('/api/store/stats');
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /docs\/setup\.md/);
});

test('los endpoints de Meta exigen un accountId con formato act_', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  assert.equal((await s.get('/api/insights')).status, 400);
  assert.equal((await s.get('/api/insights?accountId=171061813')).status, 400);
  assert.equal((await s.get('/api/insights?accountId=act_171061813')).status, 200);
});

test('un error de Meta llega al cliente como 400 con su mensaje, no como 200 vacío', async (t) => {
  const meta = metaFalso({ get: async () => ({ error: { message: 'Token expirado' } }) });
  const s = await levantar({ meta });
  t.after(() => s.close());
  const res = await s.get('/api/accounts');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'Token expirado');
});

test('la comparación devuelve el cruce y las fechas de los dos períodos', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const body = await (await s.get('/api/summary/comparison?accountId=act_1&datePreset=last_7d')).json();
  assert.equal(body.comparable, true);
  assert.equal(body.current.tn.revenue, 3000);
  assert.equal(body.current.meta.spend, 500);
  assert.match(body.ranges.current.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(body.ranges.previous.start < body.ranges.current.start);
});

test('un período en curso se declara no comparable en vez de inventar una caída', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const body = await (await s.get('/api/summary/comparison?accountId=act_1&datePreset=today')).json();
  assert.equal(body.comparable, false);
  assert.match(body.reason, /en curso/);
});

test('el webhook responde 200 antes de procesar y manda la conversión', async (t) => {
  let enviada = null;
  const conversions = { isEnabled: () => true, sendPurchase: async (o) => { enviada = o; return { ok: true }; } };
  const s = await levantar({ conversions });
  t.after(() => s.close());

  const res = await s.post('/webhook/tiendanube', { id: 555 });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  await new Promise((r) => setTimeout(r, 50));
  assert.equal(enviada.id, '555');
});

test('un webhook sin id no rompe nada y no manda evento', async (t) => {
  let llamadas = 0;
  const conversions = { isEnabled: () => true, sendPurchase: async () => { llamadas += 1; } };
  const s = await levantar({ conversions });
  t.after(() => s.close());

  assert.equal((await s.post('/webhook/store', { hola: 1 })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(llamadas, 0);
});

test('un webhook con firma inválida se rechaza con 401 y no llega nada a Meta', async (t) => {
  let llamadas = 0;
  const store = storeFalso({ verifyWebhook: () => ({ ok: false, reason: 'firma inválida' }) });
  const conversions = { isEnabled: () => true, sendPurchase: async () => { llamadas += 1; } };
  const s = await levantar({ store, conversions });
  t.after(() => s.close());

  const res = await s.post('/webhook/store', { id: 999, total: '999999' });
  assert.equal(res.status, 401);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(llamadas, 0, 'una orden inventada nunca puede llegar a Meta');
});

test('el webhook recibe el cuerpo crudo, que es sobre lo que se firma', async (t) => {
  let visto = null;
  const store = storeFalso({ verifyWebhook: (raw) => { visto = raw; return { ok: true }; } });
  const s = await levantar({ store });
  t.after(() => s.close());

  await s.post('/webhook/store', { id: 7 });
  assert.ok(Buffer.isBuffer(visto), 'tiene que llegar el Buffer original, no el objeto parseado');
  assert.equal(visto.toString(), JSON.stringify({ id: 7 }));
});

test('/api/analyze devuelve 503 cuando la IA no está configurada', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const res = await s.post('/api/analyze', {});
  assert.equal(res.status, 503);
});

test('una ruta /api inexistente devuelve JSON, no el index.html', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const res = await s.get('/api/lo-que-sea');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type'), /json/);
});

test('el dashboard se sirve desde la raíz', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const res = await s.get('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<title>/);
});
