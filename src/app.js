'use strict';

const express = require('express');
const path = require('path');

const { TtlCache } = require('./lib/cache');
const { createLogger } = require('./lib/logger');
const { errorHandler } = require('./lib/express');
const { createStoreAdapter } = require('./adapters');
const { createMetaService } = require('./services/meta');
const { createDemoStoreAdapter } = require('./demo/store');
const { createDemoMetaService } = require('./demo/meta');
const { createConversionsService } = require('./services/conversions');
const { createAiService } = require('./services/ai');

const { metaRoutes } = require('./routes/meta');
const { storeRoutes } = require('./routes/store');
const { summaryRoutes } = require('./routes/summary');
const { analyzeRoutes } = require('./routes/analyze');
const { webhookRoutes } = require('./routes/webhook');
const { healthRoutes } = require('./routes/health');

/**
 * Arma la aplicación y devuelve todo lo que hace falta para operarla.
 *
 * `server.js` solo la levanta. Separarlas es lo que permite que los tests
 * monten la app entera —con adaptadores falsos— sin abrir un puerto.
 */
function createApp(config, overrides = {}) {
  const logger = overrides.logger || createLogger({ dir: config.paths.logDir, file: 'dashboard.log' });
  const cache = overrides.cache || new TtlCache({ ttlMs: config.cache.ttlMs });
  // Modo demo: las dos integraciones se reemplazan por datos sintéticos. Sirve
  // para ver el dashboard funcionando sin sacar un solo token, y para sacar
  // capturas sin exponer los números de un negocio real.
  const demo = config.demo === true;
  const store = overrides.store || (demo ? createDemoStoreAdapter() : createStoreAdapter(config));
  const meta = overrides.meta || (demo ? createDemoMetaService() : createMetaService({ config, logger }));
  const conversions = overrides.conversions || createConversionsService({ config, metaService: meta, logger });
  const ai = overrides.ai || createAiService({ config, cache });

  const app = express();
  app.disable('x-powered-by');
  // El cuerpo crudo se guarda porque la firma del webhook se calcula sobre los
  // bytes exactos que llegaron: reserializar el JSON parseado da otro hash.
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => { req.rawBody = buf; },
  }));

  // El dashboard sirve su propio frontend desde el mismo origen, así que por
  // defecto no habilita CORS. Se abre solo a orígenes explícitos, nunca a `*`:
  // en `*`, cualquier página que visites puede leer las métricas de tu negocio
  // desde localhost.
  const allowed = config.server.allowedOrigins;
  if (allowed.length) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && (allowed.includes('*') || allowed.includes(origin))) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      return next();
    });
  }

  app.use(express.static(config.paths.publicDir));

  app.use('/api/health', healthRoutes({ config, meta, store, conversions, ai, startedAt: Date.now() }));
  app.use('/api', metaRoutes({ meta, cache }));
  app.use('/api/summary', summaryRoutes({ meta, store, cache }));
  app.use('/api/analyze', analyzeRoutes({ ai }));

  const storeRouter = storeRoutes({ store, cache, config });
  app.use('/api/store', storeRouter);
  // Alias histórico. El frontend usa `/api/store`; esto queda para no romper
  // integraciones externas que ya apuntaban acá.
  app.use('/api/tn', storeRouter);

  const webhookRouter = webhookRoutes({ store, conversions, logger });
  app.use('/webhook/store', webhookRouter);
  // La URL que ya está registrada en el panel de Tiendanube. No cambiarla.
  app.use('/webhook/tiendanube', webhookRouter);

  app.use('/api', (req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.originalUrl}` }));
  app.use((req, res) => res.sendFile(path.join(config.paths.publicDir, 'index.html')));
  app.use(errorHandler(logger));

  return { app, logger, cache, store, meta, conversions, ai };
}

module.exports = { createApp };
