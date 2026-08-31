'use strict';

/**
 * Cache en memoria con TTL.
 *
 * Existe por una razon concreta: sin esto, cada clic en el dashboard le pegaba
 * de nuevo a las dos APIs y quemaba tokens de IA con datos identicos.
 *
 * No persiste. Reiniciar el proceso lo vacia, y esta bien: son datos de lectura
 * que se pueden volver a pedir.
 */
class TtlCache {
  constructor({ ttlMs = 10 * 60 * 1000, maxEntries = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() - hit.time >= (hit.ttl ?? this.ttlMs)) {
      this.store.delete(key);
      return null;
    }
    return hit.data;
  }

  set(key, data, ttlMs) {
    if (this.store.size >= this.maxEntries) {
      // Map itera en orden de insercion: el primero es el mas viejo.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { data, time: Date.now(), ttl: ttlMs });
    return data;
  }

  /** Devuelve el valor cacheado, o corre `producer` y lo cachea. */
  async wrap(key, producer, ttlMs) {
    const hit = this.get(key);
    if (hit !== null) return hit;
    const fresh = await producer();
    return this.set(key, fresh, ttlMs);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { TtlCache };
