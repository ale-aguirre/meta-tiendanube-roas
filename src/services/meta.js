'use strict';

const fs = require('fs');
const path = require('path');
const { getJson } = require('../lib/http');

const TIMEOUT_MS = 15000;
const RENEW_THRESHOLD_SECONDS = 7 * 86400;

/**
 * Cliente de la Marketing API de Meta + manejo del token.
 *
 * El token vive en su propio archivo, desacoplado de cualquier otra
 * herramienta. Cuando compartia archivo con la config de un MCP, cambiar una
 * cosa rompia la otra.
 */
function createMetaService({ config, logger }) {
  let accessToken = config.meta.accessToken;
  const { apiVersion, appId, appSecret, tokenStorePath } = config.meta;

  function hasToken() {
    return Boolean(accessToken);
  }

  function requireToken() {
    if (!accessToken) {
      const err = new Error('Meta no está configurado (falta META_ACCESS_TOKEN). Ver docs/setup.md#meta.');
      err.status = 503;
      throw err;
    }
  }

  /** GET contra graph.facebook.com. Devuelve el body tal cual, con `error` incluido. */
  async function get(endpoint, params = {}) {
    requireToken();
    const qs = new URLSearchParams({ ...params, access_token: accessToken }).toString();
    return getJson(`https://graph.facebook.com/${apiVersion}${endpoint}?${qs}`, { timeout: TIMEOUT_MS });
  }

  /**
   * Cambia el token actual por uno nuevo de larga duracion.
   * Requiere App ID y App Secret; sin eso la renovacion es manual.
   */
  async function refreshToken() {
    if (!appId || !appSecret) {
      logger.info('[token] Sin META_APP_ID / META_APP_SECRET — renovación manual.');
      return false;
    }
    const url = 'https://graph.facebook.com/' + apiVersion + '/oauth/access_token?' + new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: accessToken,
    }).toString();

    const data = await getJson(url, { timeout: TIMEOUT_MS });
    if (!data.access_token) {
      logger.warn('[token] Falló la renovación', data.error || data);
      return false;
    }

    accessToken = data.access_token;
    const days = Math.round((data.expires_in || 0) / 86400);
    persistToken(tokenStorePath, accessToken, logger);
    logger.info(`[token] Renovado — vence en ~${days} días.`);
    return true;
  }

  /**
   * Corre al arrancar y cada 24 h. Un System User Token no vence
   * (`expires_at: 0`), asi que esto es una red de seguridad, no un requisito.
   */
  async function checkAndRefresh() {
    if (!accessToken || !config.meta.autoRefresh) return;
    try {
      const data = await getJson(
        `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
        { timeout: TIMEOUT_MS },
      );
      if (!data.data) return;

      if (!data.data.is_valid) {
        logger.warn('[token] Token inválido — renovando…');
        await refreshToken();
        return;
      }

      const expiresAt = data.data.expires_at || 0;
      if (expiresAt === 0) {
        logger.info('[token] OK — no vence (System User Token).');
        return;
      }
      const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
      const daysLeft = Math.round(secondsLeft / 86400);
      if (secondsLeft < RENEW_THRESHOLD_SECONDS) {
        logger.warn(`[token] Vence en ${daysLeft} días — renovando…`);
        await refreshToken();
      } else {
        logger.info(`[token] OK — vence en ~${daysLeft} días.`);
      }
    } catch (e) {
      // Sin red al arrancar no es motivo para no levantar el dashboard.
      logger.warn('[token] No se pudo verificar:', e.message);
    }
  }

  return {
    get,
    hasToken,
    requireToken,
    refreshToken,
    checkAndRefresh,
    getAccessToken: () => accessToken,
  };
}

function persistToken(file, token, logger) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ access_token: token, renewed_at: new Date().toISOString() }, null, 2));
  } catch (e) {
    logger.error(`[token] Renovado pero no se pudo guardar en ${file}: ${e.message}`);
  }
}

/**
 * Suma las filas de `/insights` en un solo objeto.
 *
 * Meta devuelve las compras dentro de `actions`, con tipos distintos segun de
 * donde vengan. `omni_purchase` ya incluye pixel + offline + app, asi que sumar
 * tambien `purchase` contaria la misma compra dos veces.
 */
function aggregateInsightRows(rows) {
  return (rows || []).reduce((acc, row) => {
    acc.spend += parseFloat(row.spend) || 0;
    acc.impressions += parseInt(row.impressions, 10) || 0;
    acc.clicks += parseInt(row.clicks, 10) || 0;
    const actions = row.actions || [];
    const purchase = actions.find((a) => a.action_type === 'omni_purchase')
      || actions.find((a) => a.action_type === 'purchase');
    if (purchase) acc.purchases += parseFloat(purchase.value) || 0;
    return acc;
  }, { spend: 0, impressions: 0, clicks: 0, purchases: 0 });
}

module.exports = { createMetaService, aggregateInsightRows };
