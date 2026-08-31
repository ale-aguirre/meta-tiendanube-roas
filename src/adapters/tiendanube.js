'use strict';

const crypto = require('crypto');
const { getJson, sleep } = require('../lib/http');

const API_HOST = 'https://api.tiendanube.com/v1';
const PAGE_SIZE = 200;
const TIMEOUT_MS = 30000;
// Tiendanube limita a 2 requests/segundo por tienda. Paginar sin pausa se come
// el rate limit y devuelve 429 en la mitad de las paginas.
const PAGE_DELAY_MS = 300;

const PAYMENT_LABELS = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  wallet: 'Billetera virtual',
  wire_transfer: 'Transferencia',
  custom: 'A convenir',
  account_money: 'Dinero en cuenta',
  ticket: 'Efectivo / cupón de pago',
  other: 'Otro',
  offline: 'Offline',
  digital_currency: 'Cripto',
  unknown: 'Sin dato',
};

/**
 * Adaptador de Tiendanube.
 *
 * Traduce el modelo de Tiendanube al pedido normalizado que consume el resto
 * del dashboard (ver `src/adapters/README.md`). Nada fuera de este archivo
 * sabe como se llaman los campos de Tiendanube.
 */
function createTiendanubeAdapter({ accessToken, storeId, userAgent, clientSecret = '' }) {
  function configured() {
    return Boolean(accessToken && storeId);
  }

  async function get(endpoint, params = {}) {
    if (!configured()) {
      const err = new Error('Tiendanube no está configurado (falta TIENDANUBE_ACCESS_TOKEN o TIENDANUBE_STORE_ID)');
      err.status = 503;
      throw err;
    }
    const qs = new URLSearchParams(params).toString();
    const url = `${API_HOST}/${storeId}${endpoint}${qs ? `?${qs}` : ''}`;
    return getJson(url, {
      timeout: TIMEOUT_MS,
      headers: {
        Authentication: `bearer ${accessToken}`,
        'User-Agent': userAgent,
      },
    });
  }

  /** Recorre todas las paginas de un listado de ordenes. */
  async function getAllPages(params) {
    const all = [];
    let page = 1;
    for (;;) {
      const batch = await get('/orders', { ...params, per_page: PAGE_SIZE, page });
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      page += 1;
      await sleep(PAGE_DELAY_MS);
    }
    return all;
  }

  return {
    id: 'tiendanube',
    name: 'Tiendanube',
    isConfigured: configured,

    /** Ordenes pagadas dentro de [range.start, range.end). */
    async listPaidOrders(range) {
      const params = { payment_status: 'paid' };
      if (range?.start) params.created_at_min = range.start.toISOString();
      if (range?.end) params.created_at_max = range.end.toISOString();
      const raw = await getAllPages(params);
      return raw.map(normalizeOrder);
    },

    /** Todas las ordenes pagadas de la historia de la tienda. */
    async listAllPaidOrders() {
      const raw = await getAllPages({ payment_status: 'paid' });
      return raw.map(normalizeOrder);
    },

    /**
     * Carritos abandonados. Tiendanube no tiene un recurso propio: son ordenes
     * creadas, abiertas y sin pagar.
     */
    async listAbandonedCarts({ limit = 50 } = {}) {
      const raw = await get('/orders', { per_page: limit, payment_status: 'pending', status: 'open' });
      return (Array.isArray(raw) ? raw : []).map(normalizeOrder);
    },

    /** Traduce el payload del webhook `order/paid` al pedido normalizado. */
    normalizeWebhook(payload) {
      if (!payload || !payload.id) return null;
      return normalizeOrder(payload);
    },

    /**
     * Verifica que el webhook lo mandó Tiendanube y no cualquiera.
     *
     * Sin esto, quien conozca la URL puede POSTear una orden inventada y el
     * dashboard le reenvía una compra falsa a la Conversions API de Meta: se
     * ensucia la optimización de las campañas y el ROAS reportado.
     *
     * Tiendanube firma el cuerpo crudo con HMAC-SHA256 usando el client secret
     * de la app y lo manda en `x-linkedstore-hmac-sha256`.
     * https://tiendanube.github.io/api-documentation/resources/webhook
     *
     * @returns {{ ok: boolean, reason?: string }} `ok` con motivo cuando falla.
     *   Sin secreto configurado devuelve `ok` con `reason: 'unverified'`: no se
     *     puede verificar, y el arranque ya avisó.
     */
    verifyWebhook(rawBody, headers = {}) {
      if (!clientSecret) return { ok: true, reason: 'unverified' };

      const received = headers['x-linkedstore-hmac-sha256'];
      if (!received) return { ok: false, reason: 'sin firma' };
      if (!rawBody || !rawBody.length) return { ok: false, reason: 'cuerpo vacío' };

      const expected = crypto.createHmac('sha256', clientSecret).update(rawBody).digest('hex');
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(String(received), 'utf8');
      // Comparar en tiempo constante: un `===` filtra cuántos caracteres
      // coinciden y deja adivinar la firma byte por byte.
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      return ok ? { ok: true } : { ok: false, reason: 'firma inválida' };
    },
  };
}

function normalizeOrder(o) {
  return {
    id: String(o.id),
    number: o.number != null ? String(o.number) : String(o.id),
    createdAt: o.created_at || null,
    total: parseFloat(o.total) || 0,
    currency: o.currency || null,
    shippingCost: parseFloat(o.shipping_cost_customer) || 0,
    email: (o.contact_email || '').toLowerCase().trim() || null,
    customerName: o.contact_name || null,
    province: (o.shipping_address && o.shipping_address.province) || null,
    paymentMethod: (o.payment_details && o.payment_details.method) || 'unknown',
    paymentMethodLabel: PAYMENT_LABELS[(o.payment_details && o.payment_details.method) || 'unknown']
      || (o.payment_details && o.payment_details.method)
      || 'Sin dato',
    coupons: (Array.isArray(o.coupon) ? o.coupon : [])
      .map((c) => String(c.code || c.name || 'sin codigo').toUpperCase()),
    products: (o.products || []).map((p) => ({
      id: String(p.product_id || p.id || ''),
      name: p.name_without_variants || p.name || 'Desconocido',
      quantity: p.quantity || 1,
      price: parseFloat(p.price) || 0,
    })),
  };
}

module.exports = { createTiendanubeAdapter, normalizeOrder, PAYMENT_LABELS };
