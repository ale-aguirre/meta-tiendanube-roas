'use strict';

const crypto = require('crypto');
const { postJson } = require('../lib/http');

/**
 * Conversions API de Meta: manda la compra desde el servidor.
 *
 * El pixel del navegador pierde conversiones (bloqueadores, iOS, gente que
 * cierra la pestaña antes de que dispare). El evento server-side llega igual.
 */

/** SHA-256 en minusculas y sin espacios, que es como Meta pide el dato. */
function hashEmail(email) {
  if (!email) return null;
  return crypto.createHash('sha256').update(String(email).toLowerCase().trim()).digest('hex');
}

/**
 * Arma el evento `Purchase` a partir de un pedido normalizado.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * - **`event_id`.** Meta deduplica por `event_id` + `event_name`. El `order_id`
 *   dentro de `custom_data` no sirve para eso. Sin `event_id`, cada compra
 *   entra dos veces —una por el pixel, otra por acá— e infla el ROAS, que es
 *   la única métrica del proyecto. El píxel del navegador tiene que mandar
 *   **este mismo valor** como `eventID`.
 * - **`event_time`.** Es cuándo se hizo la compra, no cuándo llegó el webhook.
 *   Si el webhook se demora, los dos eventos caen en ventanas distintas y Meta
 *   ya no los puede aparear.
 *
 * El email es el único identificador que se manda. Antes, si la orden no traía
 * email se hasheaba la dirección como reemplazo: eso no matchea con nada en
 * Meta y encima manda un dato personal al pedo. Sin email, va sin.
 */
function buildPurchaseEvent(order, { siteUrl = '', currency = 'ARS' } = {}) {
  const emailHash = hashEmail(order.email);
  const eventTime = order.createdAt
    ? Math.floor(new Date(order.createdAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    event_name: 'Purchase',
    event_id: String(order.id),
    event_time: eventTime,
    ...(siteUrl ? { event_source_url: siteUrl } : {}),
    action_source: 'website',
    user_data: {
      ...(emailHash ? { em: [emailHash] } : {}),
      client_user_agent: 'Dashboard/Server',
    },
    custom_data: {
      currency: order.currency || currency,
      value: order.total,
      order_id: String(order.id),
      contents: (order.products || []).map((p) => ({
        id: p.id,
        quantity: p.quantity,
        item_price: p.price,
      })),
    },
  };
}

function createConversionsService({ config, metaService, logger }) {
  const { pixelId, apiVersion, graphHost } = config.meta;

  function isEnabled() {
    return Boolean(pixelId && metaService.hasToken());
  }

  async function sendPurchase(order) {
    if (!isEnabled()) {
      // Antes esto POSTeaba a `/v21.0//events` con el pixel vacío, fallaba, y
      // el error quedaba enterrado en un log que nadie mira.
      const reason = !pixelId
        ? 'META_PIXEL_ID no está configurado'
        : 'META_ACCESS_TOKEN no está configurado';
      logger.warn(`[capi] Evento descartado (orden #${order.number}): ${reason}.`);
      return { skipped: true, reason };
    }

    const event = buildPurchaseEvent(order, {
      siteUrl: config.business.siteUrl,
      currency: config.business.currency,
    });

    const protocol = graphHost.includes(':') ? 'http' : 'https';
    const url = `${protocol}://${graphHost}/${apiVersion}/${pixelId}/events?access_token=${metaService.getAccessToken()}`;
    const result = await postJson(url, { data: [event] });

    logger.info(
      `[capi] Purchase orden #${order.number} · ${order.currency || config.business.currency} ${order.total}`,
      result,
    );
    return result;
  }

  return { isEnabled, sendPurchase };
}

module.exports = { createConversionsService, buildPurchaseEvent, hashEmail };
