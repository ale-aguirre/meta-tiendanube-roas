'use strict';

const { ordenesEntre } = require('./datos');

/**
 * Adaptador de tienda del modo demo.
 *
 * Cumple el mismo contrato que `adapters/tiendanube.js`
 * (ver `src/adapters/README.md`) y no toca la red. Existe para que alguien
 * pueda ver el dashboard funcionando antes de sacar un solo token.
 */
function createDemoStoreAdapter() {
  return {
    id: 'demo',
    name: 'Tienda de ejemplo',
    isConfigured: () => true,

    async listPaidOrders(range) {
      return ordenesEntre(range.start, range.end);
    },

    async listAllPaidOrders() {
      const fin = new Date();
      const inicio = new Date(fin.getFullYear(), fin.getMonth() - 14, 1);
      return ordenesEntre(inicio, fin);
    },

    async listAbandonedCarts({ limit = 50 } = {}) {
      const fin = new Date();
      const inicio = new Date(fin.getTime() - 5 * 86400000);
      // Un carrito abandonado es una orden que no se cobró: se toma una porción
      // de las del período para no inventar una forma distinta.
      return ordenesEntre(inicio, fin).filter((_, i) => i % 5 === 0).slice(0, limit);
    },

    normalizeWebhook(payload) {
      return payload && payload.id ? { ...payload, id: String(payload.id) } : null;
    },

    /** En demo no hay secreto con quien firmar, y se dice. */
    verifyWebhook() {
      return { ok: true, reason: 'unverified' };
    },
  };
}

module.exports = { createDemoStoreAdapter };
