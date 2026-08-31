#!/usr/bin/env node
'use strict';

/**
 * Diagnostica el token de Meta y, si hace falta, lo renueva.
 *
 *   node scripts/meta-token.js            # solo informa
 *   node scripts/meta-token.js --renew    # intercambia por uno de larga duración
 *
 * Lo que te interesa ver:
 *
 * - `type: SYSTEM_USER` y `expires_at: 0` → token de System User, no vence.
 *   Es lo que querés para un dashboard que corre solo.
 * - `type: USER` con vencimiento → sale de un login manual y se te va a caer.
 *   Con `--renew` lo pasás a uno de 60 días, pero la solución de fondo es
 *   generar uno de System User (ver docs/setup.md#meta).
 */

const { config } = require('../src/config');
const { createMetaService } = require('../src/services/meta');
const { getJson } = require('../src/lib/http');

const logger = {
  info: (m, meta) => console.log(' ', m, meta ?? ''),
  warn: (m, meta) => console.warn(' ', m, meta ?? ''),
  error: (m, meta) => console.error(' ', m, meta ?? ''),
};

async function main() {
  const token = config.meta.accessToken;
  if (!token) {
    console.error('  No hay token. Definí META_ACCESS_TOKEN o creá credentials/meta-dashboard-token.json.');
    console.error('  Cómo sacarlo: docs/setup.md#meta');
    process.exit(1);
  }

  const debug = await getJson(
    `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`,
    { timeout: 15000 },
  );

  if (debug.error) {
    console.error('  Meta rechazó el token:', debug.error.message);
    process.exit(1);
  }

  const d = debug.data || {};
  console.log('');
  console.log('  Tipo:      ', d.type || 'desconocido');
  console.log('  App ID:    ', d.app_id || '—');
  console.log('  Válido:    ', d.is_valid ? 'sí' : 'NO');
  console.log('  Vence:     ', d.expires_at === 0 ? 'nunca' : new Date((d.expires_at || 0) * 1000).toISOString());
  console.log('  Permisos:  ', (d.scopes || []).join(', ') || '—');
  console.log('');

  const faltantes = ['ads_read', 'ads_management'].filter((s) => !(d.scopes || []).includes(s));
  if (faltantes.length) console.log('  Faltan permisos:', faltantes.join(', '));
  if (d.type !== 'SYSTEM_USER') {
    console.log('  Este token no es de System User: va a vencer. Ver docs/setup.md#meta.');
  }

  if (process.argv.includes('--renew')) {
    if (!config.meta.appId || !config.meta.appSecret) {
      console.error('  Para renovar hacen falta META_APP_ID y META_APP_SECRET.');
      process.exit(1);
    }
    const meta = createMetaService({ config, logger });
    const ok = await meta.refreshToken();
    process.exit(ok ? 0 : 1);
  }
}

main().catch((e) => {
  console.error('  Falló:', e.message);
  process.exit(1);
});
