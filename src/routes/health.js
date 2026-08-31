'use strict';

const express = require('express');

/**
 * Qué está configurado y qué no, sin exponer ningún valor.
 *
 * Sirve para dos cosas: que el frontend pueda decir "esta sección no está
 * disponible porque falta X", y que un monitor externo sepa si el proceso está
 * vivo. Nunca devuelve tokens, ids de cuenta ni el pixel.
 */
function healthRoutes({ config, meta, store, conversions, ai, startedAt }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      demo: config.demo === true,
      business: config.business.name,
      currency: config.business.currency,
      locale: config.business.locale,
      integrations: {
        meta: { configured: meta.hasToken() },
        store: { platform: store.id, name: store.name, configured: store.isConfigured() },
        conversionsApi: { configured: conversions.isEnabled() },
        ai: { configured: ai.isEnabled(), model: ai.isEnabled() ? config.ai.model : null },
      },
      features: config.features,
    });
  });

  return router;
}

module.exports = { healthRoutes };
