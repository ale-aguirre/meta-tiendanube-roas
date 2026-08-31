'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { normalizeOrder, createTiendanubeAdapter } = require('../src/adapters/tiendanube');
const { createStoreAdapter, REGISTRY } = require('../src/adapters');

// Recorte de una orden real de Tiendanube, con los campos que usa el dashboard.
const CRUDA = {
  id: 1234567,
  number: 482,
  created_at: '2026-08-20T14:03:11-0300',
  total: '48900.00',
  currency: 'ARS',
  shipping_cost_customer: '3500.00',
  contact_email: '  Ana@Example.COM ',
  contact_name: 'Ana Pérez',
  shipping_address: { province: 'Córdoba', city: 'Villa Allende' },
  payment_details: { method: 'credit_card' },
  coupon: [{ code: 'volviste' }],
  products: [{ product_id: 77, name: 'Conjunto Lila - M', name_without_variants: 'Conjunto Lila', quantity: 2, price: '18900.00' }],
};

test('los importes salen como números, no como strings', () => {
  const o = normalizeOrder(CRUDA);
  assert.equal(o.total, 48900);
  assert.equal(o.shippingCost, 3500);
  assert.equal(o.products[0].price, 18900);
  assert.equal(typeof o.total, 'number');
});

test('el email queda en minúsculas y sin espacios, listo para hashear', () => {
  assert.equal(normalizeOrder(CRUDA).email, 'ana@example.com');
});

test('el producto usa el nombre sin variantes para poder agrupar', () => {
  assert.equal(normalizeOrder(CRUDA).products[0].name, 'Conjunto Lila');
});

test('los ids salen como string', () => {
  const o = normalizeOrder(CRUDA);
  assert.equal(o.id, '1234567');
  assert.equal(o.number, '482');
  assert.equal(o.products[0].id, '77');
});

test('los cupones salen en mayúsculas', () => {
  assert.deepEqual(normalizeOrder(CRUDA).coupons, ['VOLVISTE']);
});

test('el método de pago trae etiqueta legible', () => {
  assert.equal(normalizeOrder(CRUDA).paymentMethodLabel, 'Tarjeta de crédito');
  assert.equal(normalizeOrder({ ...CRUDA, payment_details: null }).paymentMethodLabel, 'Sin dato');
});

test('los campos ausentes quedan en null, no en cadena vacía', () => {
  const o = normalizeOrder({ id: 9 });
  assert.equal(o.email, null);
  assert.equal(o.province, null);
  assert.equal(o.customerName, null);
  assert.equal(o.total, 0);
  assert.deepEqual(o.products, []);
  assert.deepEqual(o.coupons, []);
});

test('sin credenciales el adaptador falla con 503 y un mensaje que dice qué falta', async () => {
  const store = createTiendanubeAdapter({ accessToken: '', storeId: '', userAgent: 'test' });
  assert.equal(store.isConfigured(), false);
  await assert.rejects(() => store.listPaidOrders({}), (e) => {
    assert.equal(e.status, 503);
    assert.match(e.message, /TIENDANUBE_ACCESS_TOKEN/);
    return true;
  });
});

test('normalizeWebhook ignora payloads sin id', () => {
  const store = createTiendanubeAdapter({ accessToken: 'x', storeId: '1', userAgent: 'test' });
  assert.equal(store.normalizeWebhook({}), null);
  assert.equal(store.normalizeWebhook(null), null);
  assert.equal(store.normalizeWebhook(CRUDA).id, '1234567');
});

test('sin client secret no se puede verificar la firma, y se dice', () => {
  const store = createTiendanubeAdapter({ accessToken: 'x', storeId: '1', userAgent: 't' });
  assert.deepEqual(store.verifyWebhook(Buffer.from('{}'), {}), { ok: true, reason: 'unverified' });
});

test('con client secret, una firma correcta pasa', () => {
  const secret = 'sh4r3d';
  const body = Buffer.from(JSON.stringify({ id: 1, total: '100.00' }));
  const firma = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const store = createTiendanubeAdapter({ accessToken: 'x', storeId: '1', userAgent: 't', clientSecret: secret });
  assert.deepEqual(store.verifyWebhook(body, { 'x-linkedstore-hmac-sha256': firma }), { ok: true });
});

test('una orden inventada por un tercero se rechaza', () => {
  // Sin esto, quien conozca la URL le mete a Meta una compra que no existió:
  // ensucia la optimización de las campañas y el ROAS que Meta reporta.
  const store = createTiendanubeAdapter({ accessToken: 'x', storeId: '1', userAgent: 't', clientSecret: 'sh4r3d' });
  const body = Buffer.from(JSON.stringify({ id: 999, total: '999999.00' }));
  assert.equal(store.verifyWebhook(body, { 'x-linkedstore-hmac-sha256': 'a'.repeat(64) }).ok, false);
  assert.equal(store.verifyWebhook(body, {}).reason, 'sin firma');
  assert.equal(store.verifyWebhook(Buffer.alloc(0), { 'x-linkedstore-hmac-sha256': 'x' }).reason, 'cuerpo vacío');
});

test('el mismo cuerpo firmado con otro secreto no pasa', () => {
  const body = Buffer.from(JSON.stringify({ id: 1 }));
  const firmaAjena = crypto.createHmac('sha256', 'otro-secreto').update(body).digest('hex');
  const store = createTiendanubeAdapter({ accessToken: 'x', storeId: '1', userAgent: 't', clientSecret: 'sh4r3d' });
  assert.equal(store.verifyWebhook(body, { 'x-linkedstore-hmac-sha256': firmaAjena }).ok, false);
});

test('la firma se calcula sobre los bytes crudos, no sobre el JSON reserializado', () => {
  // Tiendanube firma lo que mandó. Si se reserializa el body parseado, cambia
  // el espaciado y el hash deja de coincidir aunque el contenido sea el mismo.
  const secret = 'sh4r3d';
  const crudo = Buffer.from('{ "id": 1,  "total": "100.00" }');
  const firma = crypto.createHmac('sha256', secret).update(crudo).digest('hex');
  const store = createTiendanubeAdapter({ accessToken: 'x', storeId: '1', userAgent: 't', clientSecret: secret });

  assert.equal(store.verifyWebhook(crudo, { 'x-linkedstore-hmac-sha256': firma }).ok, true);
  const reserializado = Buffer.from(JSON.stringify(JSON.parse(crudo.toString())));
  assert.equal(store.verifyWebhook(reserializado, { 'x-linkedstore-hmac-sha256': firma }).ok, false);
});

test('el registro elige el adaptador por STORE_PLATFORM', () => {
  const base = {
    store: { platform: 'tiendanube', accessToken: 'x', storeId: '1', clientSecret: '' },
    business: { name: 'Test', contactEmail: 'a@b.com' },
  };
  assert.equal(createStoreAdapter(base).id, 'tiendanube');
  assert.throws(
    () => createStoreAdapter({ ...base, store: { ...base.store, platform: 'shopify' } }),
    /no existe/,
  );
  assert.ok(Object.keys(REGISTRY).length >= 1);
});
