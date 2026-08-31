# Adaptadores de tienda

El dashboard cruza gasto publicitario contra **plata cobrada**. De dónde sale
esa plata es intercambiable: hoy Tiendanube, mañana Shopify o WooCommerce.

Todo lo que sabe cómo se llaman los campos de una plataforma vive en este
directorio. El resto del backend (`services/`, `routes/`) trabaja únicamente
sobre el **pedido normalizado**.

## El pedido normalizado

```js
{
  id: '1234567',              // string, id interno de la plataforma
  number: '482',              // string, el número que ve el comprador
  createdAt: '2026-08-20T14:03:11+0000',  // ISO 8601, cuándo se hizo la compra
  total: 48900,               // number, total cobrado
  currency: 'ARS',            // string | null
  shippingCost: 3500,         // number, envío cobrado al cliente
  email: 'ana@example.com',   // string | null, en minúsculas y sin espacios
  customerName: 'Ana Pérez',  // string | null
  province: 'Córdoba',        // string | null
  paymentMethod: 'credit_card',
  paymentMethodLabel: 'Tarjeta de crédito',
  coupons: ['VOLVISTE'],      // string[], códigos en mayúsculas
  products: [
    { id: '99', name: 'Conjunto Lila', quantity: 2, price: 18900 }
  ]
}
```

Reglas del contrato:

- **`createdAt` es cuándo se hizo la compra**, nunca cuándo llegó el webhook. La
  Conversions API de Meta usa ese valor para aparear el evento del servidor con
  el del píxel; si difieren, caen en ventanas distintas y no aparean.
- **`email` en minúsculas y sin espacios.** Es el formato que Meta exige antes
  de hashear. Normalizarlo en el adaptador evita que cada consumidor lo repita.
- **`total` y `price` son números**, no strings. Las APIs suelen devolver
  strings y sumarlos concatena.
- Todo campo que la plataforma no tenga va en `null`, nunca en `''` ni `0`.

## La interfaz

```js
{
  id: 'tiendanube',            // slug, igual al valor de STORE_PLATFORM
  name: 'Tiendanube',          // nombre para mostrar
  isConfigured(): boolean,     // hay token y id de tienda?
  listPaidOrders(range): Promise<Order[]>,   // range = { start: Date, end: Date }
  listAllPaidOrders(): Promise<Order[]>,     // histórico completo
  listAbandonedCarts({ limit }): Promise<Order[]>,
  normalizeWebhook(payload): Order | null,
  verifyWebhook(rawBody, headers): { ok: boolean, reason?: string },
}
```

`range` es `[start, end)`: incluye el inicio y excluye el fin, alineado a
medianoche local. Lo produce `src/lib/dates.js`; el adaptador no calcula fechas.

## Agregar una plataforma

1. Copiá `tiendanube.js` a `<plataforma>.js` y reemplazá la capa HTTP y
   `normalizeOrder`.
2. Registralo en `index.js`:
   ```js
   const REGISTRY = { tiendanube: createTiendanubeAdapter, shopify: createShopifyAdapter };
   ```
3. Agregá el caso a `test/adapters.test.js` con un payload real recortado.
4. Documentá cómo se saca el token en `docs/setup.md`.

No hace falta tocar ninguna ruta ni ningún servicio. Si tuviste que hacerlo,
algo se filtró fuera del adaptador.

## `verifyWebhook` no es opcional

El endpoint del webhook está abierto a internet —tiene que estarlo, o la tienda
no llega— y **lo que reciba se lo manda a Meta**. Si el adaptador no verifica que
el POST vino de la plataforma, cualquiera que conozca la URL puede inyectar una
compra que nunca existió: se ensucia la optimización de las campañas y el ROAS
que Meta reporta.

Cada plataforma firma distinto, y por eso esto vive en el adaptador y no en la
ruta:

| Plataforma | Header | Codificación |
|---|---|---|
| Tiendanube | `x-linkedstore-hmac-sha256` | hex |
| Shopify | `x-shopify-hmac-sha256` | base64 |

Las dos firman el **cuerpo crudo** con HMAC-SHA256 y el client secret de la app.

Tres reglas que no son opinables:

- **Firmá sobre los bytes crudos**, no sobre el JSON reserializado. La ruta te
  pasa el `Buffer` original justamente por eso: `JSON.stringify(JSON.parse(x))`
  cambia el espaciado y el hash deja de coincidir.
- **Compará en tiempo constante**, con `crypto.timingSafeEqual`. Un `===` corta
  en el primer byte distinto y filtra cuántos coincidían, que es suficiente para
  adivinar la firma de a un byte.
- **Sin secreto configurado**, devolvé `{ ok: true, reason: 'unverified' }` en
  vez de rechazar. La ruta lo registra en cada orden y el arranque ya avisó;
  romper en silencio una instalación que venía andando es peor que avisar
  fuerte.

## Lo que el adaptador tiene que resolver por su cuenta

- **Paginado.** Devolver la lista completa, no la primera página.
- **Rate limit.** Tiendanube admite 2 requests/segundo por tienda: hay 300 ms de
  pausa entre páginas. Cada plataforma tiene su número.
- **Timeout.** `src/lib/http.js` lo aplica siempre; el adaptador elige cuánto.
  Tiendanube usa 30 s porque una tienda con muchas órdenes tarda.
- **Falta de credenciales.** Tirar un `Error` con `status = 503` y un mensaje
  que diga qué variable falta. Nunca dejar que el proceso se caiga.
