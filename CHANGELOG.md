# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado: [SemVer](https://semver.org/lang/es/).

## [1.0.0] — 2026-08-28

Primera versión pública.

El proyecto corrió en producción sobre una tienda real durante meses antes de
esto. Lo que sigue no es una lista de features: es lo que se rompió en el camino
y cómo quedó. Está acá porque es la parte que un diff no cuenta, y porque cada
uno de estos bugs se veía exactamente igual que si no existiera.

### Qué hace

- **El cruce.** ROAS real = ingresos cobrados ÷ gasto de Meta, medidos sobre el
  mismo período cerrado, al lado del ROAS que reporta Meta.
- **Webhook a la Conversions API**, con deduplicación contra el píxel del
  navegador y verificación de firma.
- **Reglas deterministas** en el Resumen: sin LLM, sin latencia, sin API key.
- **Análisis escrito opcional** vía OpenRouter, cacheado por hash del contenido.
- **Capa de adaptadores**: todo lo que sabe de Tiendanube está en un archivo.
  Sumar Shopify no toca ninguna ruta ni ningún cálculo.
- **`GET /api/health`**: qué está configurado y qué no, sin exponer ningún valor.
- **79 tests** con `node:test`, sin dependencias y sin tocar la red.
- **CI** en Node 20 y 22, con un job que falla si aparece un archivo de
  credenciales versionado.

### Bugs que estaban en producción

- **Meta contaba las compras dos veces.** Se sumaban `omni_purchase` **y**
  `purchase`, que son la misma compra. Inflaba las conversiones y con eso el
  ROAS reportado.
- **Los dos lados del cruce medían períodos distintos.** Las ventas de la tienda
  incluían el día en curso y el gasto de Meta no, así que el cociente no era el
  ROAS de nada. La lógica de fechas estaba duplicada en tres lugares y cada copia
  se corría un día. Ahora sale de `src/lib/dates.js`, con tests.
- **La "hora pico" salía tres horas corrida** por usar `getUTCHours()`. Ahora la
  hora se lee del offset del propio timestamp del pedido.
- **La inferencia de género matcheaba por prefijo**, así que un nombre de una
  letra coincidía con cualquier cosa. Ahora es exacta, y la feature está apagada
  por defecto: es una inferencia sobre datos personales que se equivoca y
  depende del país.
- **Un pedido HTTP sin timeout** en la renovación del token. Sin timeout un
  pedido queda colgado para siempre: ni error ni resultado, la pantalla en blanco
  y nadie sabe por qué. Ahora todo pasa por `lib/http.js`, que lo impone.
- **Los errores de Meta llegaban como `200`** con un `error` en el body y se
  veían como una cuenta sin gasto. Ahora se traducen a `400` con el mensaje.
- **`META_PIXEL_ID` vacío POSTeaba a `/v21.0//events`**, fallaba, y el error
  quedaba enterrado en un log que nadie mira. Ahora el evento se descarta con un
  aviso explícito.
- **El log del webhook era `appendFileSync`**, que bloquea el event loop mientras
  la tienda espera la respuesta — que es justo cuando reintenta.
- **El log crecía sin límite.** Esto corre meses sin que nadie lo mire. Ahora
  rota a los 5 MB con un solo archivo anterior. La rotación espera el cierre real
  del stream: en Windows renombrar un archivo con el handle abierto falla con
  EPERM, y no rotaba nunca.
- **El token de Meta se renovaba en cada arranque.** Un System User Token reporta
  `expires_at: 0`; la resta contra el reloj daba un número negativo enorme, así
  que la condición de renovar siempre era verdadera.

### Seguridad

- **El webhook no verificaba nada.** El endpoint está abierto a internet y lo que
  recibe se lo manda a Meta: cualquiera que conociera la URL podía POSTear una
  orden inventada y meterle a la Conversions API una compra que nunca existió.
  Ahora se verifica la firma HMAC-SHA256 del cuerpo crudo, en tiempo constante, y
  un POST que no valida se rechaza con `401`.
- **`Access-Control-Allow-Origin: *` en todas las respuestas.** Cualquier página
  que el usuario visitara podía leer sus métricas desde localhost. CORS ahora
  está cerrado por defecto y solo acepta orígenes explícitos.
- **Había un endpoint que abría una terminal en la máquina del usuario.** Con
  CORS abierto lo podía disparar cualquier sitio. Eliminado.
- **El servidor escuchaba en `0.0.0.0`.** Cualquier dispositivo en la misma red
  veía el dashboard entero, sin login. Ahora `127.0.0.1` por defecto.

### Deuda que se saldó al abrirlo

- `src/server.js` eran 868 líneas. Se separó en `config` / `lib` / `adapters` /
  `services` / `routes`, y `app.js` devuelve la app sin levantarla, que es lo que
  permite montar el servidor entero en los tests con adaptadores falsos.
- `index.html` eran 2.944 líneas con el CSS y el JS adentro. Salió a
  `css/dashboard.css` y cinco archivos en `js/`.
- **Nada del negocio quedó escrito en el HTML.** Nombre, moneda y locale salen de
  `/api/health`.
- El caché tiene tope de entradas: sin él, una clave por combinación de cuenta y
  período crece sin límite en un proceso que corre meses.
