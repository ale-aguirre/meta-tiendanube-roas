'use strict';

const express = require('express');
const { asyncRoute, httpError } = require('../lib/express');
const { resolveRange, isValidPreset } = require('../lib/dates');
const { summarizePeriod, buildHistoricalAnalytics } = require('../services/analytics');

/**
 * Rutas de la tienda. No conocen Tiendanube: hablan con el adaptador.
 * Se montan en `/api/store` y, por compatibilidad, también en `/api/tn`.
 */
function storeRoutes({ store, cache, config }) {
  const router = express.Router();

  const requireStore = () => {
    if (!store.isConfigured()) {
      throw httpError(503, `${store.name} no está configurado. Ver docs/setup.md#tienda.`);
    }
  };

  const range = (req) => {
    const preset = req.query.datePreset || 'last_30d';
    if (!isValidPreset(preset)) throw httpError(400, `Período inválido: ${preset}`);
    return { preset, ...resolveRange(preset) };
  };

  /** Info del adaptador activo, para que el frontend sepa con qué está hablando. */
  router.get('/info', (req, res) => {
    res.json({ id: store.id, name: store.name, configured: store.isConfigured() });
  });

  router.get('/orders', asyncRoute(async (req, res) => {
    requireStore();
    const { preset, start, end } = range(req);
    const orders = await cache.wrap(`store_orders:${store.id}:${preset}`, () => store.listPaidOrders({ start, end }));
    res.json(orders);
  }));

  router.get('/abandoned', asyncRoute(async (req, res) => {
    requireStore();
    const orders = await cache.wrap(`store_abandoned:${store.id}`, () => store.listAbandonedCarts({ limit: 50 }));
    res.json(orders);
  }));

  router.get('/stats', asyncRoute(async (req, res) => {
    requireStore();
    const { preset, start, end } = range(req);
    const stats = await cache.wrap(`store_stats:${store.id}:${preset}`, async () => {
      const [orders, abandoned] = await Promise.all([
        store.listPaidOrders({ start, end }),
        store.listAbandonedCarts({ limit: 30 }),
      ]);
      return summarizePeriod(orders, abandoned);
    });
    res.json(stats);
  }));

  /**
   * Histórico completo. Es la consulta más cara del dashboard —recorre todas
   * las páginas de órdenes de la tienda— así que tiene su propio TTL, más
   * largo que el del resto.
   */
  router.get('/analytics', asyncRoute(async (req, res) => {
    requireStore();
    const analytics = await cache.wrap(
      `store_analytics:${store.id}`,
      async () => buildHistoricalAnalytics(await store.listAllPaidOrders(), {
        inferGender: config.features.inferGender,
        locale: config.business.locale,
      }),
      config.cache.analyticsTtlMs,
    );
    res.json(analytics);
  }));

  return router;
}

module.exports = { storeRoutes };
