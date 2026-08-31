'use strict';

const { createTiendanubeAdapter } = require('./tiendanube');

const REGISTRY = {
  tiendanube: createTiendanubeAdapter,
  // shopify: createShopifyAdapter,   ← ver src/adapters/README.md
};

/**
 * Devuelve el adaptador de tienda que corresponde a `config.store.platform`.
 * El resto del backend habla con lo que devuelve esta funcion y nunca con una
 * plataforma concreta.
 */
function createStoreAdapter(config) {
  const factory = REGISTRY[config.store.platform];
  if (!factory) {
    throw new Error(
      `STORE_PLATFORM="${config.store.platform}" no existe. Disponibles: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  return factory({
    accessToken: config.store.accessToken,
    clientSecret: config.store.clientSecret,
    storeId: config.store.storeId,
    userAgent: `${config.business.name} Dashboard (${config.business.contactEmail})`,
  });
}

module.exports = { createStoreAdapter, REGISTRY };
