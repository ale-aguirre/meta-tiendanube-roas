'use strict';

const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT = 15000;

/**
 * Todo pedido a una API externa sale por aca, y por aca sale con timeout.
 * Sin timeout un pedido puede quedar colgado para siempre: ni error ni
 * resultado, la pantalla en blanco y nadie sabe por que.
 */
function request(url, { method = 'GET', headers = {}, body = null, timeout = DEFAULT_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'http:' ? http : https;
    const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        Accept: 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout,
    };

    const req = transport.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (!raw) return resolve({ status: res.statusCode, body: {} });
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          reject(new Error(`Respuesta no-JSON de ${parsed.hostname} (HTTP ${res.statusCode})`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout: ${parsed.hostname} no respondio en ${timeout}ms`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function getJson(url, opts = {}) {
  const { body } = await request(url, { ...opts, method: 'GET' });
  return body;
}

async function postJson(url, body, opts = {}) {
  const res = await request(url, {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body,
  });
  return res.body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { request, getJson, postJson, sleep, DEFAULT_TIMEOUT };
