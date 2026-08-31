#!/usr/bin/env node
'use strict';

const { exec } = require('child_process');
const { config, warnings } = require('./config');
const { createApp } = require('./app');

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function main() {
  const { app, logger, meta, store, conversions, ai } = createApp(config);

  const server = app.listen(config.server.port, config.server.host, () => {
    const url = `http://${config.server.host}:${config.server.port}`;
    banner(url);
    for (const w of warnings) logger.warn(`AVISO: ${w}`);

    logger.info('Integraciones: ' + [
      `Meta ${meta.hasToken() ? 'ok' : 'sin token'}`,
      `${store.name} ${store.isConfigured() ? 'ok' : 'sin token'}`,
      `Conversions API ${conversions.isEnabled() ? 'ok' : 'apagada'}`,
      `IA ${ai.isEnabled() ? config.ai.model : 'apagada'}`,
    ].join(' · '));

    if (config.server.openBrowser) openBrowser(url);

    // Al arrancar y una vez por día. Un System User Token no vence, así que es
    // una red de seguridad y no un requisito.
    setTimeout(() => meta.checkAndRefresh(), 3000).unref();
    setInterval(() => meta.checkAndRefresh(), REFRESH_INTERVAL_MS).unref();
  });

  const shutdown = (signal) => {
    logger.info(`${signal} recibido, cerrando…`);
    server.close(() => logger.close().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function banner(url) {
  const title = `${config.business.name} Dashboard`;
  const width = Math.max(title.length, url.length) + 6;
  const line = '+' + '-'.repeat(width) + '+';
  const row = (text) => `|   ${text.padEnd(width - 3)}|`;
  console.log('');
  console.log('  ' + line);
  console.log('  ' + row(title));
  console.log('  ' + row(url));
  console.log('  ' + line);
  console.log(`  Webhook de conversiones: POST ${url}/webhook/store`);
  console.log('  Ctrl+C para detener');
  console.log('');
}

/**
 * Abre el navegador al arrancar. `NO_OPEN=1` lo apaga: reiniciar el server
 * mientras desarrollás abría una pestaña nueva cada vez.
 */
function openBrowser(url) {
  const command = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
  setTimeout(() => exec(command, { shell: process.platform === 'win32' ? 'cmd.exe' : undefined }, () => {}), 800).unref();
}

if (require.main === module) main();

module.exports = { main };
