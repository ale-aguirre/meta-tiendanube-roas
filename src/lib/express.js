'use strict';

/**
 * Envuelve un handler async para que un `throw` llegue al middleware de error
 * en vez de quedar en una promesa rechazada que nadie escucha.
 */
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Error con código HTTP, para distinguir "falta una credencial" de "se rompió algo". */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Middleware de error final.
 *
 * Un dashboard que se queda en blanco cuando falla algo es peor que uno que no
 * existe: el frontend necesita un mensaje para poder mostrar qué pasó.
 */
function errorHandler(logger) {
  // Express identifica el middleware de error por su aridad: los cuatro
  // argumentos tienen que estar, aunque `next` no se use.
  return (err, req, res, next) => {
    const status = err.status || 500;
    // 503 acá no es una falla: es "falta una credencial", y ya se avisó al
    // arrancar. Repetirlo en cada request tapa los errores que sí importan.
    if (status >= 500 && status !== 503) logger.error(`${req.method} ${req.originalUrl} → ${err.message}`);
    res.status(status).json({ error: err.message });
  };
}

module.exports = { asyncRoute, httpError, errorHandler };
