'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { buildPurchaseEvent, hashEmail } = require('../src/services/conversions');

const ORDEN = {
  id: '9911',
  number: '482',
  createdAt: '2026-08-20T14:03:11-0300',
  total: 48900,
  currency: 'ARS',
  email: 'Ana@Example.com ',
  products: [{ id: '77', name: 'Conjunto', quantity: 2, price: 18900 }],
};

test('el event_id es el id de la orden: sin eso Meta cuenta la compra dos veces', () => {
  // Meta deduplica por event_id + event_name. El píxel del navegador tiene que
  // mandar este mismo valor como eventID.
  const e = buildPurchaseEvent(ORDEN);
  assert.equal(e.event_id, '9911');
  assert.equal(e.event_name, 'Purchase');
});

test('el event_time es cuándo se compró, no cuándo llegó el webhook', () => {
  const e = buildPurchaseEvent(ORDEN);
  assert.equal(e.event_time, Math.floor(new Date('2026-08-20T14:03:11-0300').getTime() / 1000));
});

test('sin created_at cae al momento actual', () => {
  const antes = Math.floor(Date.now() / 1000);
  const e = buildPurchaseEvent({ ...ORDEN, createdAt: null });
  assert.ok(e.event_time >= antes);
});

test('el email sale hasheado, en minúsculas y sin espacios', () => {
  const e = buildPurchaseEvent(ORDEN);
  const esperado = crypto.createHash('sha256').update('ana@example.com').digest('hex');
  assert.deepEqual(e.user_data.em, [esperado]);
  assert.ok(!JSON.stringify(e).includes('Ana@Example.com'));
});

test('sin email no se manda ningún identificador de reemplazo', () => {
  // Antes se hasheaba la dirección: no matchea con nada en Meta y encima manda
  // un dato personal al pedo.
  const e = buildPurchaseEvent({ ...ORDEN, email: null });
  assert.equal(e.user_data.em, undefined);
  assert.deepEqual(Object.keys(e.user_data), ['client_user_agent']);
});

test('el valor y los productos van en custom_data', () => {
  const e = buildPurchaseEvent(ORDEN, { siteUrl: 'https://tienda.example' });
  assert.equal(e.custom_data.value, 48900);
  assert.equal(e.custom_data.currency, 'ARS');
  assert.equal(e.custom_data.order_id, '9911');
  assert.deepEqual(e.custom_data.contents, [{ id: '77', quantity: 2, item_price: 18900 }]);
  assert.equal(e.event_source_url, 'https://tienda.example');
});

test('sin SITE_URL el evento sale sin event_source_url en vez de con uno vacío', () => {
  const e = buildPurchaseEvent(ORDEN, { siteUrl: '' });
  assert.equal('event_source_url' in e, false);
});

test('la moneda por defecto se usa solo si la orden no trae la suya', () => {
  assert.equal(buildPurchaseEvent({ ...ORDEN, currency: null }, { currency: 'USD' }).custom_data.currency, 'USD');
  assert.equal(buildPurchaseEvent(ORDEN, { currency: 'USD' }).custom_data.currency, 'ARS');
});

test('hashEmail devuelve null sin entrada', () => {
  assert.equal(hashEmail(null), null);
  assert.equal(hashEmail(''), null);
});
