'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLogger } = require('../src/lib/logger');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
}

test('escribe la línea con nivel y timestamp', async () => {
  const dir = tmpDir();
  const log = createLogger({ dir, file: 'x.log', silent: true });
  log.info('hola', { a: 1 });
  await log.close();

  const contenido = fs.readFileSync(path.join(dir, 'x.log'), 'utf8');
  assert.match(contenido, /^\[\d{4}-\d{2}-\d{2}T[^\]]+\] INFO hola \{"a":1\}$/m);
});

test('el archivo rota al pasar el tope, en vez de crecer sin límite', async () => {
  // Esto corre meses sin que nadie lo mire: sin tope llena el disco.
  const dir = tmpDir();
  const log = createLogger({ dir, file: 'x.log', silent: true, maxBytes: 300 });
  for (let i = 0; i < 40; i++) log.info(`linea de relleno numero ${i}`);
  await log.close();

  assert.ok(fs.existsSync(path.join(dir, 'x.log')), 'sigue existiendo el archivo actual');
  assert.ok(fs.existsSync(path.join(dir, 'x.log.1')), 'el anterior quedó como .1');
  assert.ok(fs.statSync(path.join(dir, 'x.log')).size <= 300 * 2, 'el actual no crece indefinidamente');
});

test('el disco ocupado tiene techo: no se acumulan .2, .3, .4', async () => {
  const dir = tmpDir();
  const log = createLogger({ dir, file: 'x.log', silent: true, maxBytes: 200 });
  for (let i = 0; i < 200; i++) log.info(`linea ${i}`);
  await log.close();

  const archivos = fs.readdirSync(dir).sort();
  assert.deepEqual(archivos, ['x.log', 'x.log.1']);
});

test('sin directorio no escribe a disco y no rompe', async () => {
  const log = createLogger({ silent: true });
  log.info('al vacío');
  log.error('tampoco esto');
  await log.close();
});

test('un objeto con ciclos no tira excepción', async () => {
  const dir = tmpDir();
  const log = createLogger({ dir, file: 'x.log', silent: true });
  const ciclo = { a: 1 };
  ciclo.self = ciclo;
  log.warn('ojo', ciclo);
  await log.close();

  assert.match(fs.readFileSync(path.join(dir, 'x.log'), 'utf8'), /WARN ojo/);
});
