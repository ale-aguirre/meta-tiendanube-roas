'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');

/* ── helpers ────────────────────────────────────────────────────────────── */

function str(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : String(v).trim();
}

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'si', 'sí', 'on'].includes(String(v).toLowerCase());
}

function list(name) {
  return str(name).split(',').map((s) => s.trim()).filter(Boolean);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Lee un `.env` con formato shell (`export CLAVE="valor"`).
 *
 * Existe solo por compatibilidad: las versiones viejas guardaban el App ID y el
 * App Secret de Meta en `credentials/.env.meta-ads`. Para instalaciones nuevas
 * todo eso vive en el `.env` de la raiz.
 */
function readShellEnv(file) {
  const out = {};
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return out;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/* ── configuracion ──────────────────────────────────────────────────────── */

const credentialsDir = path.resolve(str('CREDENTIALS_DIR', path.join(ROOT, 'credentials')));
const logDir = path.resolve(str('LOG_DIR', path.join(ROOT, 'logs')));

const metaTokenStore = path.join(credentialsDir, 'meta-dashboard-token.json');
const storeTokenFile = path.join(credentialsDir, 'tiendanube-token.json');
const legacyConfigFile = path.join(credentialsDir, 'dashboard-config.json');
const legacyMetaEnvFile = path.join(credentialsDir, '.env.meta-ads');

const legacyMetaEnv = readShellEnv(legacyMetaEnvFile);
const legacyMetaToken = readJson(metaTokenStore) || {};
const legacyStoreToken = readJson(storeTokenFile) || {};
const legacyConfig = readJson(legacyConfigFile) || {};

const warnings = [];

const config = {
  root: ROOT,
  env: str('NODE_ENV', 'development'),
  // Datos sinteticos en lugar de Meta y la tienda. No toca la red.
  demo: bool('DEMO_MODE', false),

  server: {
    port: num('PORT', 3000),
    host: str('HOST', '127.0.0.1'),
    // Vacio = solo mismo origen. El dashboard sirve su propio frontend, asi que
    // no necesita CORS. Abrirlo a `*` deja que cualquier pagina que visites lea
    // las metricas de tu negocio desde localhost.
    allowedOrigins: list('ALLOWED_ORIGINS'),
    openBrowser: !bool('NO_OPEN', false) && bool('OPEN_BROWSER', true),
  },

  business: {
    name: str('BUSINESS_NAME', 'Mi Tienda'),
    type: str('BUSINESS_TYPE', 'tiendas de e-commerce'),
    siteUrl: str('SITE_URL', ''),
    contactEmail: str('APP_CONTACT_EMAIL', 'contacto@example.com'),
    currency: str('CURRENCY', 'ARS'),
    locale: str('LOCALE', 'es-AR'),
  },

  meta: {
    apiVersion: str('META_API_VERSION', 'v21.0'),
    // Solo para tests: apunta la Conversions API a un server local y te deja
    // mirar el evento que sale de verdad. En produccion no se define.
    graphHost: str('META_GRAPH_HOST', 'graph.facebook.com'),
    accessToken: str('META_ACCESS_TOKEN', legacyMetaToken.access_token || legacyMetaEnv.META_ACCESS_TOKEN || ''),
    appId: str('META_APP_ID', legacyMetaEnv.META_APP_ID || ''),
    appSecret: str('META_APP_SECRET', legacyMetaEnv.META_APP_SECRET || ''),
    pixelId: str('META_PIXEL_ID', ''),
    tokenStorePath: metaTokenStore,
    autoRefresh: bool('META_TOKEN_AUTO_REFRESH', true),
  },

  store: {
    platform: str('STORE_PLATFORM', 'tiendanube'),
    accessToken: str('TIENDANUBE_ACCESS_TOKEN', legacyStoreToken.access_token || ''),
    // El mismo secreto de la app que se usa para el OAuth firma los webhooks.
    clientSecret: str('TIENDANUBE_CLIENT_SECRET', ''),
    storeId: str('TIENDANUBE_STORE_ID', legacyStoreToken.store_id ? String(legacyStoreToken.store_id) : ''),
    tokenFilePath: storeTokenFile,
  },

  ai: {
    enabled: bool('AI_ENABLED', true),
    apiKey: str('OPENROUTER_API_KEY', legacyConfig.openrouter_key || ''),
    model: str('OPENROUTER_MODEL', 'anthropic/claude-haiku-4.5'),
    maxTokens: num('OPENROUTER_MAX_TOKENS', 700),
  },

  cache: {
    ttlMs: num('CACHE_TTL_MINUTES', 10) * 60 * 1000,
    analyticsTtlMs: num('ANALYTICS_CACHE_TTL_MINUTES', 30) * 60 * 1000,
  },

  features: {
    // Inferir genero a partir del nombre de pila es una heuristica, depende del
    // pais y se equivoca. Apagada por defecto; la prendes si sabes que tu base
    // de clientes es la que cubre el diccionario.
    inferGender: bool('FEATURE_INFER_GENDER', false),
  },

  paths: {
    credentialsDir,
    logDir,
    publicDir: path.join(__dirname, 'public'),
  },
};

/* ── validacion: lo que falta se dice al arrancar, no cuando falla ─────── */

if (!config.meta.accessToken) {
  warnings.push('Falta META_ACCESS_TOKEN — las secciones de Meta Ads van a devolver 503. Ver docs/setup.md#meta.');
}
if (!config.store.accessToken || !config.store.storeId) {
  warnings.push('Falta TIENDANUBE_ACCESS_TOKEN o TIENDANUBE_STORE_ID — las secciones de la tienda van a devolver 503. Ver docs/setup.md#tienda.');
}
if (!config.meta.pixelId) {
  warnings.push('Falta META_PIXEL_ID — el webhook de conversiones queda desactivado (no se envia nada a Meta).');
}
if (config.meta.pixelId && !config.store.clientSecret) {
  warnings.push('Falta TIENDANUBE_CLIENT_SECRET — el webhook acepta cualquier POST sin verificar la firma. Ver docs/webhook.md#firma.');
}
if (!config.business.siteUrl) {
  warnings.push('Falta SITE_URL — los eventos de la Conversions API salen sin event_source_url.');
}
if (config.ai.enabled && !config.ai.apiKey) {
  warnings.push('Falta OPENROUTER_API_KEY — /api/analyze devuelve 503. El resto del dashboard anda igual.');
}
if (config.server.allowedOrigins.includes('*')) {
  warnings.push('ALLOWED_ORIGINS=* deja que cualquier sitio lea tus métricas desde el navegador. Usá orígenes explícitos.');
}

module.exports = { config, warnings };
