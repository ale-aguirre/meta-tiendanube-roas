'use strict';

const express = require('express');

/**
 * Webhook de la tienda → Conversions API de Meta.
 *
 * Responde 200 **antes** de procesar. La tienda reintenta el webhook si no
 * recibe respuesta rápido, y un reintento sería una conversión duplicada.
 *
 * Antes de eso verifica la firma: sin esa comprobación, quien conozca la URL
 * puede POSTear una orden inventada y el dashboard le reenvía una compra falsa
 * a Meta.
 */
function webhookRoutes({ store, conversions, logger }) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const check = store.verifyWebhook
      ? store.verifyWebhook(req.rawBody, req.headers)
      : { ok: true, reason: 'unverified' };

    if (!check.ok) {
      logger.warn(`[webhook] Rechazado: ${check.reason}.`);
      return res.status(401).json({ error: 'Firma inválida' });
    }

    res.status(200).json({ ok: true });

    setImmediate(async () => {
      try {
        const order = store.normalizeWebhook(req.body);
        if (!order) {
          logger.warn('[webhook] Payload sin id de orden, ignorado.');
          return;
        }
        if (check.reason === 'unverified') {
          logger.warn(`[webhook] Orden #${order.number} aceptada SIN verificar la firma.`);
        }
        await conversions.sendPurchase(order);
      } catch (e) {
        logger.error(`[webhook] ${e.message}`);
      }
    });
  });

  return router;
}

module.exports = { webhookRoutes };
