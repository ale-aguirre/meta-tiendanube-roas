'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Log a consola y, opcionalmente, a un archivo.
 *
 * Dos cosas que no son adorno:
 *
 * - **La escritura es asíncrona.** `appendFileSync` en el handler del webhook
 *   bloquea el event loop mientras la tienda espera la respuesta, y la tienda
 *   reintenta el webhook si tarda.
 * - **El archivo rota.** Esto corre meses sin que nadie lo mire; sin tope,
 *   crece hasta llenar el disco.
 */
function createLogger({ dir = null, file = 'app.log', silent = false, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  let stream = null;
  let written = 0;
  let filePath = null;
  // Promesa de la rotacion en curso, o null. close() la espera: sin esto hay
  // que pollear, y un poll con unref no mantiene vivo el event loop.
  let rotacion = null;
  const pendientes = [];

  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, file);
    written = sizeOf(filePath);
    stream = open(filePath);
  }

  function open(target) {
    const s = fs.createWriteStream(target, { flags: 'a' });
    s.on('error', (e) => console.error('  [log] no se pudo escribir:', e.message));
    return s;
  }

  /**
   * Una sola rotación: el archivo actual pasa a `.1` y se empieza de cero. El
   * `.1` anterior se pisa, así que el disco ocupado tiene un techo de
   * `2 × maxBytes` y no hay que limpiar nada a mano.
   *
   * El rename espera a que el stream cierre **de verdad**: en Windows renombrar
   * un archivo con un handle abierto falla con EPERM, y la rotación no pasaba
   * nunca. Las líneas que llegan mientras tanto se guardan y se escriben
   * después, en orden.
   */
  function rotate() {
    const previous = stream;
    stream = null;

    rotacion = new Promise((resolve) => {
      previous.end(() => {
        try {
          fs.renameSync(filePath, `${filePath}.1`);
          written = 0;
        } catch (e) {
          // Si el rename falla igual, seguimos escribiendo en el mismo archivo:
          // perder el log es peor que pasarse del tope.
          console.error('  [log] no se pudo rotar:', e.message);
        }
        stream = open(filePath);
        rotacion = null;
        flush();
        resolve();
      });
    });
  }

  /**
   * Escribe una línea, o la encola si hay que rotar primero.
   *
   * El tope se chequea acá y no en `write`, para que las líneas que se
   * acumularon durante una rotación pasen por la misma regla. Si se vuelcan
   * todas de golpe sin chequear, una ráfaga se pasa del tope y la rotación no
   * sirvió de nada.
   */
  function emit(line) {
    const len = Buffer.byteLength(line);
    if (rotacion) {
      pendientes.push(line);
      return;
    }
    // `written > 0` evita el bucle cuando una sola línea ya supera el tope:
    // en un archivo vacío se escribe igual y se pasa, que es lo correcto.
    if (written > 0 && written + len > maxBytes) {
      pendientes.push(line);
      rotate();
      return;
    }
    written += len;
    stream.write(line);
  }

  function flush() {
    if (!stream) return;
    for (const line of pendientes.splice(0)) emit(line);
  }

  function write(level, message, meta) {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`
      + (meta === undefined ? '' : ` ${safeJson(meta)}`) + '\n';

    if (!silent) {
      (level === 'error' ? console.error : console.log)(`  ${message}`, meta === undefined ? '' : meta);
    }
    if (!stream && !rotacion) return;
    emit(line);
  }

  /**
   * Cierra después de drenar.
   *
   * El `while` no es por las dudas: al terminar una rotación se vuelcan las
   * líneas pendientes, y ese volcado puede disparar la siguiente. Con un solo
   * `await` se cierra en el medio de la cadena y se pierden líneas.
   */
  async function close() {
    while (rotacion) await rotacion;
    if (!stream) return undefined;
    return new Promise((resolve) => stream.end(resolve));
  }

  return {
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
    close,
  };
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size;
  } catch (e) {
    return 0;
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

module.exports = { createLogger, DEFAULT_MAX_BYTES };
