'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createApp } = require('../src/app');
const { TtlCache } = require('../src/lib/cache');
const { CUENTA_DEMO } = require('../src/demo/meta');
const { ordenesDelDia } = require('../src/demo/datos');

const CONFIG = {
  env: 'test',
  demo: true,
  server: { port: 0, host: '127.0.0.1', allowedOrigins: [], openBrowser: false },
  business: { name: 'Demo', type: 'e-commerce', siteUrl: '', contactEmail: 'a@b.com', currency: 'ARS', locale: 'es-AR' },
  meta: { apiVersion: 'v21.0', graphHost: 'graph.facebook.com', pixelId: '', accessToken: '', appId: '', appSecret: '', tokenStorePath: '', autoRefresh: false },
  store: { platform: 'demo' },
  ai: { enabled: false, apiKey: '', model: 'x', maxTokens: 10 },
  cache: { ttlMs: 60000, analyticsTtlMs: 60000 },
  features: { inferGender: false },
  paths: { publicDir: path.join(__dirname, '..', 'src', 'public'), credentialsDir: '', logDir: '' },
};

function levantar() {
  const { app } = createApp(CONFIG, {
    logger: { info() {}, warn() {}, error() {}, close: async () => {} },
    cache: new TtlCache({ ttlMs: 60000 }),
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({ get: (p) => fetch(base + p), close: () => new Promise((r) => server.close(r)) });
    });
  });
}

test('el modo demo no necesita ninguna credencial', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const health = await (await s.get('/api/health')).json();
  assert.equal(health.integrations.meta.configured, true);
  assert.equal(health.integrations.store.configured, true);
  assert.equal(health.integrations.store.platform, 'demo');
});

test('el cruce da un ROAS plausible, no un número absurdo', async (t) => {
  // Si el gasto y las ventas se generan por separado sin relación, el ROAS sale
  // en 15x y la captura del README miente sobre lo que hace el producto.
  const s = await levantar();
  t.after(() => s.close());
  const c = await (await s.get(`/api/summary/comparison?accountId=${CUENTA_DEMO}&datePreset=last_7d`)).json();
  assert.equal(c.comparable, true);
  const roas = c.current.tn.revenue / c.current.meta.spend;
  assert.ok(roas > 2 && roas < 9, `ROAS fuera de rango creíble: ${roas.toFixed(2)}x`);
});

test('Meta reporta más compras que las que se cobran, que es el punto del dashboard', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const c = await (await s.get(`/api/summary/comparison?accountId=${CUENTA_DEMO}&datePreset=last_7d`)).json();
  assert.ok(c.current.meta.purchases > c.current.tn.orders);
});

test('hay una campaña que gasta y no vende, para que las reglas tengan qué señalar', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const insights = await (await s.get(`/api/insights?accountId=${CUENTA_DEMO}&datePreset=last_7d`)).json();
  const sinVentas = insights.data.filter((row) => parseFloat(row.spend) > 0 && !(row.actions || []).length);
  assert.equal(sinVentas.length, 1);
});

test('los datos son deterministas: la misma fecha da siempre lo mismo', async () => {
  // Sin esto una captura no se puede repetir y cualquier diferencia entre dos
  // corridas parece un bug de la interfaz.
  const dia = new Date(2026, 7, 20);
  assert.deepEqual(ordenesDelDia(dia), ordenesDelDia(new Date(2026, 7, 20)));
  assert.notDeepEqual(ordenesDelDia(dia), ordenesDelDia(new Date(2026, 7, 21)));
});

test('el histórico y las stats del período responden', async (t) => {
  const s = await levantar();
  t.after(() => s.close());
  const stats = await (await s.get('/api/store/stats?datePreset=last_7d')).json();
  assert.ok(stats.orders > 0 && stats.revenue > 0);
  assert.ok(stats.topProducts.length > 0);

  const analytics = await (await s.get('/api/store/analytics')).json();
  assert.ok(analytics.total_orders > 0);
  assert.ok(analytics.provincias.length > 0);
});
