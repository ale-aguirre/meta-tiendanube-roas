'use strict';

const { CAMPANAS, ordenesEntre, rng, semillaDe } = require('./datos');
const { resolveRange, toISODate, addDays, startOfDay } = require('../lib/dates');

const CUENTA = 'act_000000000000000';

/**
 * Servicio de Meta del modo demo.
 *
 * Responde con la misma forma que la Marketing API —incluida la rareza de meter
 * las compras dentro de `actions`— para que el resto del código no sepa que no
 * está hablando con Meta.
 *
 * El gasto se deriva de las mismas órdenes que devuelve la tienda demo, así el
 * ROAS que sale del cruce es coherente en vez de dos series inventadas por
 * separado que no se tocan.
 */
function createDemoMetaService() {
  function gastoDelDia(fecha) {
    const r = rng(semillaDe(fecha) + 7);
    const base = CAMPANAS.filter((c) => !c.pausada).reduce((a, c) => a + c.presupuestoDiario, 0) / 100;
    return Math.round(base * (0.82 + r() * 0.36));
  }

  function filaDeCampana(campana, dias, comprasTotales, gastoTotal) {
    const parte = campana.presupuestoDiario
      / CAMPANAS.filter((c) => !c.pausada).reduce((a, c) => a + c.presupuestoDiario, 0);
    const spend = campana.pausada ? 0 : Math.round(gastoTotal * parte);
    // La campaña de público frío existe para que el dashboard tenga algo real
    // que señalar: gasta y no vende. Es el caso que dispara la regla.
    const compras = campana.roas === 0 ? 0 : Math.round(comprasTotales * parte);
    const impresiones = Math.round(spend * 7.4);
    const clicks = Math.round(impresiones * (campana.ctr / 100));

    return {
      campaign_id: campana.id,
      campaign_name: campana.nombre,
      impressions: String(impresiones),
      reach: String(Math.round(impresiones / 2.3)),
      clicks: String(clicks),
      spend: spend.toFixed(2),
      cpc: clicks ? (spend / clicks).toFixed(2) : '0',
      cpm: impresiones ? ((spend / impresiones) * 1000).toFixed(2) : '0',
      ctr: campana.ctr.toFixed(2),
      frequency: (1.4 + parte * 3).toFixed(2),
      actions: compras ? [{ action_type: 'omni_purchase', value: String(compras) }] : [],
      action_values: [],
      cost_per_action_type: [],
      purchase_roas: compras ? [{ action_type: 'omni_purchase', value: String(campana.roas) }] : [],
      date_start: toISODate(dias[0]),
      date_stop: toISODate(dias[dias.length - 1]),
    };
  }

  function diasDe(range) {
    const out = [];
    const cursor = startOfDay(range.start);
    while (cursor < range.end) {
      out.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out.length ? out : [startOfDay(range.start)];
  }

  function rangoDe(params) {
    if (params.time_range) {
      const { since, until } = JSON.parse(params.time_range);
      return { start: new Date(`${since}T00:00:00`), end: addDays(new Date(`${until}T00:00:00`), 1) };
    }
    return resolveRange(params.date_preset || 'last_7d');
  }

  async function get(endpoint, params = {}) {
    if (endpoint === '/me/adaccounts') {
      return { data: [{ id: CUENTA, name: 'Cuenta de ejemplo', account_status: 1, currency: 'ARS', spend_cap: '0', amount_spent: '0' }] };
    }

    if (endpoint.endsWith('/campaigns')) {
      return {
        data: CAMPANAS.map((c) => ({
          id: c.id,
          name: c.nombre,
          status: c.pausada ? 'PAUSED' : 'ACTIVE',
          effective_status: c.pausada ? 'PAUSED' : 'ACTIVE',
          daily_budget: String(c.presupuestoDiario),
          objective: c.objetivo,
        })),
      };
    }

    if (endpoint.endsWith('/insights')) {
      const range = rangoDe(params);
      const dias = diasDe(range);
      const ordenes = ordenesEntre(range.start, range.end);
      // Meta atribuye de más: reporta ~25% más compras que las que se cobran.
      // Esa brecha es justamente lo que el dashboard existe para mostrar.
      const compras = Math.round(ordenes.length * 1.25);
      const gasto = dias.reduce((a, d) => a + gastoDelDia(d), 0);

      if (params.time_increment === 1) {
        return {
          data: dias.map((d) => {
            const delDia = ordenesEntre(d, addDays(d, 1));
            const spend = gastoDelDia(d);
            const impresiones = Math.round(spend * 7.4);
            return {
              impressions: String(impresiones),
              clicks: String(Math.round(impresiones * 0.017)),
              spend: spend.toFixed(2),
              cpm: ((spend / impresiones) * 1000).toFixed(2),
              ctr: '1.70',
              actions: [{ action_type: 'omni_purchase', value: String(Math.round(delDia.length * 1.25)) }],
              date_start: toISODate(d),
              date_stop: toISODate(d),
            };
          }),
        };
      }

      if (params.level === 'account') {
        const impresiones = Math.round(gasto * 7.4);
        return {
          data: [{
            impressions: String(impresiones),
            clicks: String(Math.round(impresiones * 0.017)),
            spend: gasto.toFixed(2),
            actions: [{ action_type: 'omni_purchase', value: String(compras) }],
            date_start: toISODate(dias[0]),
            date_stop: toISODate(dias[dias.length - 1]),
          }],
        };
      }

      return { data: CAMPANAS.map((c) => filaDeCampana(c, dias, compras, gasto)) };
    }

    return { data: [] };
  }

  return {
    get,
    hasToken: () => true,
    requireToken() {},
    refreshToken: async () => true,
    checkAndRefresh: async () => {},
    getAccessToken: () => 'demo',
  };
}

module.exports = { createDemoMetaService, CUENTA_DEMO: CUENTA };
