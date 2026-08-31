'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TtlCache } = require('../src/lib/cache');
const { sanitize } = require('../src/services/ai');

test('devuelve lo guardado antes de que venza el TTL', () => {
  const c = new TtlCache({ ttlMs: 1000 });
  c.set('k', { a: 1 });
  assert.deepEqual(c.get('k'), { a: 1 });
});

test('una clave vencida devuelve null y se descarta', () => {
  const c = new TtlCache({ ttlMs: 0 });
  c.set('k', 'v');
  assert.equal(c.get('k'), null);
  assert.equal(c.size, 0);
});

test('wrap corre el productor una sola vez', async () => {
  const c = new TtlCache({ ttlMs: 1000 });
  let veces = 0;
  const producir = async () => { veces += 1; return veces; };
  assert.equal(await c.wrap('k', producir), 1);
  assert.equal(await c.wrap('k', producir), 1);
  assert.equal(veces, 1);
});

test('un TTL propio pisa al general', async () => {
  const c = new TtlCache({ ttlMs: 60000 });
  c.set('corto', 'v', 0);
  assert.equal(c.get('corto'), null);
});

test('no crece sin límite: descarta la entrada más vieja', () => {
  const c = new TtlCache({ ttlMs: 60000, maxEntries: 3 });
  for (const k of ['a', 'b', 'c', 'd']) c.set(k, k);
  assert.equal(c.size, 3);
  assert.equal(c.get('a'), null);
  assert.equal(c.get('d'), 'd');
});

test('sanitize corta el razonamiento que el modelo mete antes de la respuesta', () => {
  // Un modelo gratuito devolvía su cadena de pensamiento en inglés y el
  // dashboard la mostraba como si fuera el análisis.
  const crudo = 'Okay, let me think about this. The user wants...\n\nDIAGNÓSTICO:\nEl gasto subió.';
  assert.equal(sanitize(crudo), 'DIAGNÓSTICO:\nEl gasto subió.');
});

test('sanitize saca los bloques <think>', () => {
  assert.equal(sanitize('<think>bla bla</think>\nDIAGNÓSTICO:\nOk.'), 'DIAGNÓSTICO:\nOk.');
});

test('sanitize deja intacta una respuesta que ya viene con el formato', () => {
  const ok = 'DIAGNÓSTICO:\nTodo bien.\n\nOPORTUNIDAD:\nEscalar.';
  assert.equal(sanitize(ok), ok);
});

test('sanitize no borra una respuesta sin secciones reconocibles', () => {
  assert.equal(sanitize('  texto suelto  '), 'texto suelto');
});
