'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizePeriod, buildHistoricalAnalytics, inferGender, localHour } = require('../src/services/analytics');
const { aggregateInsightRows } = require('../src/services/meta');

const orden = (over = {}) => ({
  id: '1', number: '1', createdAt: '2026-08-20T14:03:11-0300', total: 10000, currency: 'ARS',
  shippingCost: 1000, email: 'a@b.com', customerName: 'Ana Pérez', province: 'Córdoba',
  paymentMethod: 'credit_card', paymentMethodLabel: 'Tarjeta de crédito', coupons: [],
  products: [{ id: 'p1', name: 'Conjunto', quantity: 1, price: 9000 }],
  ...over,
});

test('summarizePeriod calcula revenue, ticket y envío', () => {
  const s = summarizePeriod([orden(), orden({ id: '2', total: 20000, shippingCost: 500 })]);
  assert.equal(s.orders, 2);
  assert.equal(s.revenue, 30000);
  assert.equal(s.avgTicket, 15000);
  assert.equal(s.shippingTotal, 1500);
});

test('sin órdenes el ticket promedio es 0 y no NaN', () => {
  const s = summarizePeriod([]);
  assert.equal(s.avgTicket, 0);
  assert.equal(s.revenue, 0);
  assert.deepEqual(s.topProducts, []);
});

test('los productos se agrupan por nombre y se ordenan por facturación', () => {
  const s = summarizePeriod([
    orden({ products: [{ id: 'p1', name: 'A', quantity: 1, price: 100 }] }),
    orden({ id: '2', products: [{ id: 'p1', name: 'A', quantity: 2, price: 100 }] }),
    orden({ id: '3', products: [{ id: 'p2', name: 'B', quantity: 1, price: 500 }] }),
  ]);
  assert.deepEqual(s.topProducts, [
    { name: 'B', qty: 1, revenue: 500 },
    { name: 'A', qty: 3, revenue: 300 },
  ]);
});

test('revenueByDay queda ordenado por fecha ascendente', () => {
  const s = summarizePeriod([
    orden({ id: '1', createdAt: '2026-08-22T10:00:00-0300', total: 200 }),
    orden({ id: '2', createdAt: '2026-08-20T10:00:00-0300', total: 100 }),
    orden({ id: '3', createdAt: '2026-08-20T18:00:00-0300', total: 50 }),
  ]);
  assert.deepEqual(s.revenueByDay, [
    { date: '2026-08-20', revenue: 150 },
    { date: '2026-08-22', revenue: 200 },
  ]);
});

test('los carritos abandonados se resumen aparte y se cuentan todos', () => {
  const abandonados = Array.from({ length: 15 }, (_, i) => orden({ id: String(i), total: 100 }));
  const s = summarizePeriod([], abandonados);
  assert.equal(s.abandonedCount, 15);
  assert.equal(s.abandonedTotal, 1500);
  assert.equal(s.abandoned.length, 10, 'la lista visible se recorta, el conteo no');
});

test('la hora sale de la zona horaria del pedido, no de UTC', () => {
  // Con getUTCHours() una compra de las 14 en Argentina aparecía a las 17 y la
  // "hora pico" quedaba tres horas corrida.
  assert.equal(localHour('2026-08-20T14:03:11-0300'), 14);
  assert.equal(localHour('2026-08-20T23:59:00+0200'), 23);
  assert.equal(localHour(null), null);
});

test('el histórico agrupa provincias, pagos, meses y recompra', () => {
  const d = buildHistoricalAnalytics([
    orden({ id: '1', email: 'ana@x.com', province: 'Córdoba', total: 10000 }),
    orden({ id: '2', email: 'ana@x.com', province: 'Córdoba', total: 30000 }),
    orden({ id: '3', email: 'luis@x.com', province: 'Buenos Aires', total: 60000, coupons: ['VOLVISTE'] }),
  ]);
  assert.equal(d.total_orders, 3);
  assert.equal(d.total_revenue, 100000);
  assert.equal(d.provincias[0].prov, 'Córdoba');
  assert.equal(d.comportamiento.unique_customers, 2);
  assert.equal(d.comportamiento.repeat_customers, 1);
  assert.equal(d.comportamiento.repeat_rate, 50);
  assert.equal(d.comportamiento.cupones_total, 1);
  assert.deepEqual(d.comportamiento.cupones_detalle, [{ code: 'VOLVISTE', uses: 1 }]);
});

test('los rangos de ticket cubren todos los importes sin dejar ninguno afuera', () => {
  const totales = [1, 19999, 20000, 35000, 45000, 65000, 999999];
  const d = buildHistoricalAnalytics(totales.map((total, i) => orden({ id: String(i), total })));
  assert.equal(d.rangos.reduce((a, r) => a + r.count, 0), totales.length);
});

test('el género está apagado por defecto y devuelve null en vez de ceros', () => {
  assert.equal(buildHistoricalAnalytics([orden()]).genero, null);
  const conFeature = buildHistoricalAnalytics([orden()], { inferGender: true });
  assert.deepEqual(conFeature.genero, { hombres: 0, mujeres: 1, sinDato: 0 });
});

test('inferGender solo acepta coincidencias exactas del nombre de pila', () => {
  assert.equal(inferGender('Ana Pérez'), 'mujer');
  assert.equal(inferGender('juan carlos'), 'hombre');
  // Antes hacía coincidencia por prefijo y "A" matcheaba con cualquier cosa.
  assert.equal(inferGender('A'), 'sin_dato');
  assert.equal(inferGender('Kwame'), 'sin_dato');
  assert.equal(inferGender(null), 'sin_dato');
});

test('aggregateInsightRows no cuenta la misma compra dos veces', () => {
  // Meta devuelve la compra en `purchase` y también dentro de `omni_purchase`.
  // Sumar los dos duplicaba las conversiones y con eso el ROAS reportado.
  const total = aggregateInsightRows([{
    spend: '100.5', impressions: '1000', clicks: '50',
    actions: [{ action_type: 'purchase', value: '3' }, { action_type: 'omni_purchase', value: '3' }],
  }]);
  assert.equal(total.purchases, 3);
  assert.equal(total.spend, 100.5);
  assert.equal(total.impressions, 1000);
});

test('aggregateInsightRows tolera filas vacías', () => {
  assert.deepEqual(aggregateInsightRows(undefined), { spend: 0, impressions: 0, clicks: 0, purchases: 0 });
  assert.equal(aggregateInsightRows([{ spend: 'nada' }]).spend, 0);
});
