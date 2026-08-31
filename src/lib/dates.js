'use strict';

/**
 * Un unico lugar donde se resuelven los periodos.
 *
 * Antes esta logica estaba escrita tres veces (stats de la tienda, ordenes y
 * comparacion) y cada copia se corria un dia distinta. El sintoma visible era
 * que el grafico diario dibujaba un dia mas que el numero de arriba, con las
 * dos cosas en la misma pantalla.
 *
 * Los rangos son [start, end): incluyen el inicio y excluyen el fin, y estan
 * alineados a medianoche local. `last_7d` son los 7 dias cerrados anteriores a
 * hoy, que es lo mismo que significa `last_7d` en la API de Meta. Sin esa
 * alineacion el gasto de Meta y las ventas de la tienda no hablan del mismo
 * periodo, y el ROAS que sale del cruce no significa nada.
 */

const ROLLING_DAYS = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };

const PRESETS = [
  'today', 'yesterday',
  'last_7d', 'last_14d', 'last_30d', 'last_90d',
  'this_month', 'last_month', 'this_year',
];

/** Periodos que todavia estan corriendo: no tienen un anterior equivalente cerrado. */
const IN_PROGRESS = new Set(['today', 'this_month', 'this_year']);

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** `YYYY-MM-DD` en hora local (no UTC: `toISOString` corre el dia). */
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidPreset(preset) {
  return PRESETS.includes(preset);
}

/**
 * @returns {{ start: Date, end: Date, closed: boolean }} rango [start, end).
 *   `closed` es false cuando el periodo todavia esta en curso.
 */
function resolveRange(preset, now = new Date()) {
  const today = startOfDay(now);

  if (preset === 'today') return { start: today, end: now, closed: false };
  if (preset === 'yesterday') return { start: addDays(today, -1), end: today, closed: true };
  if (ROLLING_DAYS[preset]) {
    return { start: addDays(today, -ROLLING_DAYS[preset]), end: today, closed: true };
  }
  if (preset === 'this_month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, closed: false };
  }
  if (preset === 'last_month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
      closed: true,
    };
  }
  if (preset === 'this_year') {
    return { start: new Date(now.getFullYear(), 0, 1), end: now, closed: false };
  }
  throw new Error(`Periodo desconocido: ${preset}`);
}

/**
 * Rango actual + el anterior de la misma duracion, para comparar.
 *
 * Un periodo en curso no se compara: medio dia contra un dia entero da una
 * caida que no existe.
 */
function comparisonRange(preset, now = new Date()) {
  if (!isValidPreset(preset)) {
    return { comparable: false, reason: 'El período seleccionado no admite una comparación equivalente.' };
  }
  if (IN_PROGRESS.has(preset)) {
    return {
      comparable: false,
      reason: 'El período todavía está en curso; no hay un período anterior equivalente cerrado.',
    };
  }

  const current = resolveRange(preset, now);

  if (preset === 'last_month') {
    return {
      comparable: true,
      current,
      previous: {
        start: new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1),
        end: current.start,
        closed: true,
      },
    };
  }

  const duration = current.end.getTime() - current.start.getTime();
  return {
    comparable: true,
    current,
    previous: {
      start: new Date(current.start.getTime() - duration),
      end: new Date(current.start),
      closed: true,
    },
  };
}

/**
 * Meta pide `time_range` con fechas inclusivas en los dos extremos, mientras
 * que aca los rangos son [start, end). El `until` va un dia atras.
 */
function toMetaTimeRange(range) {
  return {
    since: toISODate(range.start),
    until: toISODate(addDays(startOfDay(range.end), range.end.getTime() === startOfDay(range.end).getTime() ? -1 : 0)),
  };
}

module.exports = {
  PRESETS,
  IN_PROGRESS,
  isValidPreset,
  resolveRange,
  comparisonRange,
  toMetaTimeRange,
  toISODate,
  startOfDay,
  addDays,
};
