# Dashboard de ROAS real

Meta Ads y tu tienda nunca te dan el mismo número, y ninguno de los dos te da el
que importa:

> ¿Cuánta plata gasté en publicidad, y cuánta plata **entró de verdad**?

Meta cuenta compras que su píxel se atribuye. Tu tienda cuenta órdenes que
cobraste. Este dashboard consulta las dos APIs, cruza los datos y muestra el
**ROAS real**: facturación confirmada dividida gasto publicitario, al lado del
ROAS que reporta Meta.

Node + Express, sin build step. Un `.env`, `npm start`, y anda.

**Stack:** Node ≥20, Express, HTML plano con Tailwind y Chart.js por CDN.
Cero dependencias de runtime más allá de `express` y `dotenv`.

---

## El problema

| | Meta Ads Manager | Tu tienda |
|---|---|---|
| Qué mide | Compras **atribuidas** por el píxel | Órdenes **pagadas** de verdad |
| Cuándo | Ventana de atribución (7d clic / 1d vista) | Momento del cobro |
| Sesgo | Sobrestima: se atribuye ventas que iban a pasar igual | No sabe nada de tus ads |

El ROAS de portada de Meta sirve para comparar anuncios entre sí, no para saber
si el negocio gana plata. Para eso hace falta el dato de la caja.

## Qué hace

### 1. El cruce — ROAS real

```
ROAS real = ingresos de la tienda (órdenes pagadas) ÷ gasto de Meta
```

Los dos lados se miden sobre **el mismo período cerrado**, alineado a la
medianoche local: si uno incluyera el día de hoy y el otro no, el cociente no
significaría nada. Al lado va el ROAS que reporta Meta; la brecha entre ambos es
tu factor de corrección.

La pestaña **Resumen** agrega la comparación contra el período anterior
equivalente y un bloque *Qué mirar* con reglas **deterministas** — sin LLM, sin
latencia, sin API key, misma entrada igual salida. Detectan campañas que cuestan
más que el ticket promedio, campañas con gasto y cero compras, discrepancia
entre Meta y la caja, gasto que sube mientras bajan los ingresos, y CTR bajo.

### 2. Webhook de la tienda → Meta Conversions API

La parte más útil. El píxel del navegador pierde conversiones: bloqueadores,
iOS, gente que cierra la pestaña antes de que dispare. La solución de Meta es
mandar el evento **desde el servidor**.

```
tienda (orden pagada)
   → POST /webhook/store
   → SHA-256 del email del comprador
   → POST graph.facebook.com/{PIXEL_ID}/events
   → Meta recibe el Purchase con el valor real
```

El email nunca viaja en claro. El evento lleva `event_id` = id de la orden, que
es lo que permite a Meta **deduplicar** contra el evento del píxel: si llegan
los dos, cuenta uno solo. Sin ese campo cada compra entra dos veces y el ROAS
reportado sale al doble. → [docs/webhook.md](docs/webhook.md)

### 3. Análisis escrito (opcional)

`POST /api/analyze` arma un prompt con las métricas de las dos plataformas
juntas y se lo manda a un modelo vía OpenRouter. Tiene caché por hash del
contenido: los mismos datos de entrada devuelven la respuesta guardada en vez de
volver a pagar tokens. Sin API key, devuelve 503 y el resto anda igual.

## Instalación

```bash
git clone https://github.com/ale-aguirre/meta-tiendanube-roas.git
cd meta-tiendanube-roas
npm install
cp .env.example .env      # completá lo que uses
npm start
```

Abre `http://localhost:3000`. **Arranca sin ninguna credencial** y te lista en
consola exactamente qué falta; cada sección sin configurar devuelve 503 con su
motivo en vez de romper la pantalla.

Después, en orden de cuánto suman:

1. **[Token de Meta](docs/setup.md#meta)** — sin esto no hay gasto ni campañas.
2. **[Token de la tienda](docs/setup.md#tienda)** — `npm run setup:tiendanube`
   hace el OAuth completo por vos.
3. **[Píxel + webhook](docs/setup.md#pixel)** — para el envío server-side.
4. **[OpenRouter](docs/setup.md#ia)** — opcional.

## Documentación

| | |
|---|---|
| [docs/setup.md](docs/setup.md) | Cómo conseguir cada credencial, paso a paso, con los errores típicos |
| [docs/configuracion.md](docs/configuracion.md) | Todas las variables de entorno y qué hace cada una |
| [docs/arquitectura.md](docs/arquitectura.md) | Cómo está armado y por qué |
| [docs/api.md](docs/api.md) | Referencia de endpoints |
| [docs/webhook.md](docs/webhook.md) | Conversions API, deduplicación y cómo verificarla |
| [src/adapters/README.md](src/adapters/README.md) | Cómo sumar Shopify u otra plataforma |
| [docs/diseno.md](docs/diseno.md) | Reglas de la interfaz: color, tipografía, movimiento, estados |
| [docs/referencias.md](docs/referencias.md) | Cómo resuelven estas decisiones Google Ads, Shopify, Stripe y Polaris |
| [docs/estado.md](docs/estado.md) | Qué está hecho, qué falta, y qué falta a propósito |
| [CHANGELOG.md](CHANGELOG.md) | Qué cambió en cada versión y qué se rompía antes |
| [skill/SKILL.md](skill/SKILL.md) | Skill de Claude Code para trabajar sobre este repo |

## Otras plataformas de e-commerce

Todo lo que sabe de Tiendanube vive en `src/adapters/tiendanube.js`. El resto
del backend trabaja sobre un **pedido normalizado**. Sumar Shopify o WooCommerce
es escribir un archivo y registrarlo — no se toca ninguna ruta ni ningún
cálculo. El contrato está en [src/adapters/README.md](src/adapters/README.md).

## Desarrollo

```bash
npm run dev      # recarga sola al guardar
npm test         # node:test, sin dependencias
npm run lint
npm run check    # lint + tests, lo mismo que corre CI
```

Los tests no tocan la red: montan la app entera con adaptadores falsos.

## Seguridad y privacidad

- **Ningún secreto en el código.** Todo sale del `.env` o de `credentials/`, que
  está entero en `.gitignore`.
- **CORS cerrado por defecto.** El dashboard sirve su propio frontend desde el
  mismo origen. `ALLOWED_ORIGINS` acepta orígenes explícitos; nunca uses `*`, o
  cualquier página que visites podría leer tus métricas desde localhost.
- **`HOST=127.0.0.1` por defecto**, no `0.0.0.0`. El dashboard no tiene login:
  si lo exponés a la red, ponele autenticación adelante.
- **El webhook verifica la firma** HMAC-SHA256 del cuerpo crudo. Es el único
  endpoint abierto a internet, y lo que recibe se lo manda a Meta: sin esa
  comprobación, quien conozca la URL puede inyectar una compra que no existió.
- **Datos personales.** Las órdenes traen nombre, email y dirección de gente
  real. No los persiste en disco, y a Meta solo sale el email hasheado.
- Ver [SECURITY.md](SECURITY.md).

