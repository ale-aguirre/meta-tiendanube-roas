'use strict';

const express = require('express');
const { asyncRoute, httpError } = require('../lib/express');
const { isValidPreset } = require('../lib/dates');

const INSIGHT_FIELDS = [
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'impressions', 'reach', 'clicks', 'spend',
  'cpc', 'cpm', 'ctr', 'frequency',
  'actions', 'action_values', 'cost_per_action_type', 'purchase_roas',
].join(',');

/** Rutas de lectura de la Marketing API. Todas pasan por cache. */
function metaRoutes({ meta, cache }) {
  const router = express.Router();

  /** Meta devuelve los errores con 200 y un `error` en el body. */
  const unwrap = (result) => {
    if (result && result.error) throw httpError(400, result.error.message || 'Error de Meta API');
    return result;
  };

  const preset = (req) => {
    const value = req.query.datePreset || 'last_7d';
    if (!isValidPreset(value)) throw httpError(400, `Período inválido: ${value}`);
    return value;
  };

  const accountId = (req) => {
    const value = req.query.accountId;
    if (!value) throw httpError(400, 'accountId requerido');
    if (!/^act_[0-9]+$/.test(value)) throw httpError(400, 'accountId inválido');
    return value;
  };

  router.get('/accounts', asyncRoute(async (req, res) => {
    const data = await cache.wrap('accounts', async () => unwrap(await meta.get('/me/adaccounts', {
      fields: 'id,name,account_status,currency,spend_cap,amount_spent',
      limit: 20,
    })));
    res.json(data);
  }));

  router.get('/campaigns', asyncRoute(async (req, res) => {
    const id = accountId(req);
    const data = await cache.wrap(`campaigns:${id}`, async () => unwrap(await meta.get(`/${id}/campaigns`, {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,objective',
      limit: 100,
    })));
    res.json(data);
  }));

  router.get('/insights', asyncRoute(async (req, res) => {
    const id = accountId(req);
    const datePreset = preset(req);
    const level = ['account', 'campaign', 'adset', 'ad'].includes(req.query.level) ? req.query.level : 'campaign';
    const data = await cache.wrap(`insights:${id}:${datePreset}:${level}`, async () => unwrap(
      await meta.get(`/${id}/insights`, { fields: INSIGHT_FIELDS, date_preset: datePreset, level, limit: 100 }),
    ));
    res.json(data);
  }));

  router.get('/insights/daily', asyncRoute(async (req, res) => {
    const id = accountId(req);
    const datePreset = preset(req);
    const data = await cache.wrap(`insights_daily:${id}:${datePreset}`, async () => unwrap(
      await meta.get(`/${id}/insights`, {
        fields: 'impressions,clicks,spend,actions,cpm,ctr,date_start,date_stop',
        date_preset: datePreset,
        level: 'account',
        time_increment: 1,
        limit: 90,
      }),
    ));
    res.json(data);
  }));

  return router;
}

module.exports = { metaRoutes };
