#!/usr/bin/env node
'use strict';

/**
 * Intercambia el `code` de OAuth de Tiendanube por un access token.
 *
 *   node scripts/tiendanube-oauth.js
 *
 * Levanta un servidor local en el puerto de la redirect URI, te da el link de
 * instalación, espera el callback y guarda el token.
 *
 * El `client_secret` nunca se escribe en el código: sale del entorno o te lo
 * pregunta por consola.
 *
 * Documentación: https://tiendanube.github.io/api-documentation/authentication
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const { postJson } = require('../src/lib/http');

require('dotenv').config();

const TOKEN_URL = 'https://www.tiendanube.com/apps/authorize/token';
const CODE_TTL_HINT = 'El code vence a los 5 minutos: si tarda, volvé a abrir el link.';

async function main() {
  const appId = process.env.TIENDANUBE_APP_ID || await preguntar('App ID (client_id) de la app: ');
  const clientSecret = process.env.TIENDANUBE_CLIENT_SECRET || await preguntar('Client secret: ', { oculto: true });
  const port = Number(process.env.TIENDANUBE_OAUTH_PORT || 8123);

  if (!appId || !clientSecret) {
    console.error('Faltan el App ID o el client secret.');
    process.exit(1);
  }

  const redirectUri = `http://localhost:${port}/callback`;
  const authorizeUrl = `https://www.tiendanube.com/apps/${appId}/authorize`;

  console.log('');
  console.log('  1. En el panel de Partners, la Redirect URI de la app tiene que ser:');
  console.log(`     ${redirectUri}`);
  console.log('  2. Abrí este link e instalá la app en tu tienda:');
  console.log(`     ${authorizeUrl}`);
  console.log(`     ${CODE_TTL_HINT}`);
  console.log('');

  abrirNavegador(authorizeUrl);

  const code = await esperarCallback(port);
  console.log('  Code recibido. Intercambiando por el token…');

  const res = await postJson(TOKEN_URL, {
    client_id: String(appId),
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
  });

  if (!res.access_token) {
    console.error('  Tiendanube no devolvió un token:', JSON.stringify(res));
    process.exit(1);
  }

  const destino = path.resolve(process.env.CREDENTIALS_DIR || path.join(__dirname, '..', 'credentials'));
  fs.mkdirSync(destino, { recursive: true });
  const archivo = path.join(destino, 'tiendanube-token.json');
  fs.writeFileSync(archivo, JSON.stringify({
    access_token: res.access_token,
    store_id: String(res.user_id),
    scope: res.scope,
    obtained_at: new Date().toISOString(),
  }, null, 2) + '\n');

  console.log('');
  console.log(`  Guardado en ${archivo}`);
  console.log('  Permisos otorgados:', res.scope);
  console.log('');
  console.log('  Si preferís el .env en vez del archivo, pegá esto:');
  console.log('');
  console.log(`  TIENDANUBE_ACCESS_TOKEN=${res.access_token}`);
  console.log(`  TIENDANUBE_STORE_ID=${res.user_id}`);
  console.log('');
  console.log('  El token no vence. Se invalida si pedís otro o si desinstalan la app.');
}

function esperarCallback(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(code
        ? '<h1>Listo</h1><p>Ya podés cerrar esta pestaña y volver a la terminal.</p>'
        : '<h1>Faltó el code</h1><p>Volvé a abrir el link de instalación.</p>');
      if (code) {
        server.close();
        resolve(code);
      }
    });
    server.on('error', reject);
    server.listen(port, () => console.log(`  Esperando el callback en http://localhost:${port}/callback …`));
  });
}

function preguntar(pregunta, { oculto = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (oculto) {
      // Sin eco: el secreto no queda en el scrollback de la terminal.
      const escribir = rl.output.write.bind(rl.output);
      rl.output.write = (chunk) => (rl.stdoutMuted ? true : escribir(chunk));
      rl.question(pregunta, (respuesta) => {
        rl.output.write = escribir;
        rl.output.write('\n');
        rl.close();
        resolve(respuesta.trim());
      });
      rl.stdoutMuted = true;
      rl.output.write(pregunta);
      return;
    }
    rl.question(pregunta, (respuesta) => { rl.close(); resolve(respuesta.trim()); });
  });
}

function abrirNavegador(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, { shell: process.platform === 'win32' ? 'cmd.exe' : undefined }, () => {});
}

main().catch((e) => {
  console.error('  Falló:', e.message);
  process.exit(1);
});
