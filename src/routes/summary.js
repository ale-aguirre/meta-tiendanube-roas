'use strict';

const express = require('express');
const { asyncRoute, httpError } = require('../lib/express');
const { comparisonRange, toMetaTimeRange, toISODate, isValidPreset } = require('../lib/dates');
const { aggregateInsightRows } = require('../services/meta');

/**
 * El cruce: el mismo período cerrado, medido en Meta y en la caja, contra el
 * período anterior de la misma duración.
 *
 * Es el único endpoint que consulta las dos plataformas a la vez, y el que
 * hace que el número del titular signifique algo.
 */
function summaryRoutes({ meta, store, cache }) {
  const router = express.Router();

  router.get('/comparison', asyncRoute(async (req, res) => {
    const { accountId } = req.query;
    const datePreset = req.query.datePreset || 'last_7d';

    if (!accountId) throw httpError(400, 'accountId requerido');
    if (!/^act_[0-9]+$/.test(accountId)) throw httpError(400, 'accountId inválido');
    if (!isValidPreset(datePreset)) throw httpError(400, `Período inválido: ${datePreset}`);
    if (!store.isConfigured()) throw httpError(503, `${store.name} no está configurado. Ver docs/setup.md#tienda.`);

    const ranges = comparisonRange(datePreset);
    if (!ranges.comparable) return res.json(ranges);

    const key = `summary_comparison:${accountId}:${datePreset}:${toISODate(ranges.current.start)}`;
    const data = await cache.wrap(key, async () => {
      const metaParams = (range) => ({
        fields: 'impressions,clicks,spend,actions',
        level: 'account',
        time_range: JSON.stringify(toMetaTimeRange(range)),
      });

      const [currentMeta, previousMeta, currentOrders, previousOrders] = await Promise.all([
        meta.get(`/${accountId}/insights`, metaParams(ranges.current)),
        meta.get(`/${accountId}/insights`, metaParams(ranges.previous)),
        store.listPaidOrders(ranges.current),
        store.listPaidOrders(ranges.previous),
      ]);

      const metaError = currentMeta.error || previousMeta.error;
      if (metaError) throw httpError(400, metaError.message || 'Error de Meta API');

      return {
        comparable: true,
        current: { meta: aggregateInsightRows(currentMeta.data), tn: totals(currentOrders) },
        previous: { meta: aggregateInsightRows(previousMeta.data), tn: totals(previousOrders) },
        // `start` / `end` son las fechas visibles, inclusivas en los dos
        // extremos: son las que el frontend imprime ("17 al 23 ago") y las que
        // usa para recortar el gráfico diario al mismo rango que las métricas.
        ranges: {
          current: visibleRange(ranges.current),
          previous: visibleRange(ranges.previous),
        },
      };
    });

    res.json(data);
  }));

  return router;
}

function visibleRange(range) {
  const { since, until } = toMetaTimeRange(range);
  return { start: since, end: until };
}

function totals(orders) {
  return {
    orders: orders.length,
    revenue: orders.reduce((acc, o) => acc + o.total, 0),
  };
}

module.exports = { summaryRoutes };
