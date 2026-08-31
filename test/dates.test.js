'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveRange, comparisonRange, toMetaTimeRange, toISODate, isValidPreset } = require('../src/lib/dates');

// Lunes 25 de agosto de 2026, 14:30 hora local.
const AHORA = new Date(2026, 7, 25, 14, 30, 0);

test('last_7d son los 7 días cerrados anteriores a hoy', () => {
  const r = resolveRange('last_7d', AHORA);
  assert.equal(toISODate(r.start), '2026-08-18');
  assert.equal(toISODate(r.end), '2026-08-25');
  assert.equal(r.closed, true);
});

test('el rango excluye hoy, igual que el date_preset de Meta', () => {
  // Si incluyera hoy, el gasto de Meta y las ventas de la tienda hablarían de
  // períodos distintos y el ROAS del cruce no significaría nada.
  const { until } = toMetaTimeRange(resolveRange('last_7d', AHORA));
  assert.equal(until, '2026-08-24');
});

test('today y this_month quedan marcados como en curso', () => {
  assert.equal(resolveRange('today', AHORA).closed, false);
  assert.equal(resolveRange('this_month', AHORA).closed, false);
  assert.equal(resolveRange('this_year', AHORA).closed, false);
});

test('yesterday es un solo día cerrado', () => {
  const r = resolveRange('yesterday', AHORA);
  assert.equal(toISODate(r.start), '2026-08-24');
  assert.equal(toISODate(r.end), '2026-08-25');
});

test('last_month va del 1 al 1', () => {
  const r = resolveRange('last_month', AHORA);
  assert.equal(toISODate(r.start), '2026-07-01');
  assert.equal(toISODate(r.end), '2026-08-01');
});

test('un período en curso no se compara', () => {
  for (const preset of ['today', 'this_month', 'this_year']) {
    const c = comparisonRange(preset, AHORA);
    assert.equal(c.comparable, false, preset);
    assert.match(c.reason, /en curso/);
  }
});

test('la comparación usa el período anterior de la misma duración', () => {
  const c = comparisonRange('last_7d', AHORA);
  assert.equal(c.comparable, true);
  assert.equal(toISODate(c.current.start), '2026-08-18');
  assert.equal(toISODate(c.previous.start), '2026-08-11');
  assert.equal(toISODate(c.previous.end), '2026-08-18');
});

test('last_month se compara contra el mes anterior completo, no contra 31 días', () => {
  const c = comparisonRange('last_month', AHORA);
  assert.equal(toISODate(c.previous.start), '2026-06-01');
  assert.equal(toISODate(c.previous.end), '2026-07-01');
});

test('la comparación cruza el fin de año sin romperse', () => {
  const eneroPrimero = new Date(2027, 0, 3, 9, 0, 0);
  const c = comparisonRange('last_7d', eneroPrimero);
  assert.equal(toISODate(c.current.start), '2026-12-27');
  assert.equal(toISODate(c.previous.start), '2026-12-20');
});

test('un preset inventado no es válido y no se compara', () => {
  assert.equal(isValidPreset('last_5d'), false);
  assert.equal(comparisonRange('last_5d', AHORA).comparable, false);
  assert.throws(() => resolveRange('last_5d', AHORA), /Periodo desconocido/);
});

test('toISODate usa la fecha local, no la UTC', () => {
  // A las 22:00 en Argentina (UTC-3) ya es el día siguiente en UTC. Con
  // toISOString el rango se corría un día entero.
  const nocheAr = new Date(2026, 7, 25, 22, 0, 0);
  assert.equal(toISODate(nocheAr), '2026-08-25');
});
