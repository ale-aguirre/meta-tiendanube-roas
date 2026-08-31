---
name: meta-tiendanube-roas
description: Use when working on this dashboard — the Node/Express app that joins Meta Ads with an e-commerce store to compute the real ROAS. Covers reading the real ROAS versus Meta's reported ROAS, the store-to-Conversions-API webhook, adding endpoints, adding a store adapter, debugging blank tabs or hung requests, and token renewal. Trigger on questions about the dashboard, el ROAS real, el webhook de conversiones, agregar Shopify, o por que Meta y la tienda no coinciden.
---

# Dashboard de ROAS real

Node + Express. Entry point `src/server.js`; la app se arma en `src/app.js`.
Arranca en `http://localhost:3000`.

## La regla central

**Meta y la tienda nunca van a coincidir, y no es un bug.**

- Meta cuenta compras *atribuidas* dentro de su ventana (7d clic / 1d vista).
- La tienda cuenta plata *cobrada*.

Antes de diagnosticar una brecha como error de configuración, asumí que es
atribución. Solo sospechá del píxel si la brecha cambia de golpe de un día para
el otro, o si aparecen varios días seguidos en cero.

Para decidir sobre plata, siempre:

```
ROAS real = ingresos de la tienda ÷ gasto de Meta
```

El ROAS de portada de Meta sirve para comparar anuncios entre sí, no para saber
si el negocio gana.

## Antes de recomendar cualquier cambio

Traé la métrica **en vivo** en el mismo turno. Nunca cites un número de una
conversación anterior ni de memoria: los presupuestos y el rendimiento cambian
todos los días, y un consejo basado en un número viejo cuesta plata real.

```bash
curl "http://localhost:3000/api/summary/comparison?accountId=act_XXX&datePreset=last_7d"
```

## Dónde está cada cosa

| Necesito… | Archivo |
|---|---|
| Agregar un endpoint | `src/routes/` |
| Tocar un cálculo | `src/services/analytics.js` — funciones puras |
| Cambiar un período | `src/lib/dates.js` — **el único lugar** |
| Soportar otra plataforma | `src/adapters/` + su README |
| Ver por qué falta un dato | `GET /api/health` |
| Reglas de "Qué mirar" | `src/public/js/summary.js`, `evaluarReglas()` |

## Fallas conocidas y su causa

| Síntoma | Causa | Fix |
|---|---|---|
| Tab en blanco, carga infinita | Request sin timeout | Los pedidos van por `lib/http.js`, que lo impone |
| Sección Meta Ads vacía | Falta o venció el token | `npm run token:meta` |
| `/me/adaccounts` devuelve `[]` | La cuenta no está asignada al system user | `docs/setup.md#meta` |
| Gasto de tokens de IA que se dispara | Ruta nueva sin caché | Pasala por `cache.wrap` |
| Conversiones contadas doble en Meta | Falta `event_id`, o el píxel manda otro | `docs/webhook.md` |
| Tres conversiones por compra | Tiendanube también manda Purchase nativo | Apagá uno de los dos |
| La tienda reintenta el webhook | El servidor tardó en responder | Responder 200 antes de procesar |
| El gráfico no coincide con la métrica de arriba | Rangos distintos | Los dos salen de `lib/dates.js` |

## Al agregar un endpoint nuevo

1. Pasalo por `cache.wrap` (TTL 10 min).
2. Validá los parámetros y devolvé `400` con el motivo.
3. Si falta una credencial, `503` con el nombre de la variable — nunca un crash.
4. Los períodos salen de `lib/dates.js`. No calcules fechas en una ruta.
5. Agregá el test en `test/api.test.js`: monta la app con adaptadores falsos y
   no toca la red.
6. `npm run check`.

## Al tocar el frontend

Scripts clásicos, sin bundler, un solo scope global. Orden de carga:
`core → summary → meta-ads → store → app`.

Un global que cruza archivos tiene que estar declarado en `eslint.config.js` o
`no-undef` no te cubre, y el error recién aparece cuando el usuario hace clic.

Nada del negocio va escrito en el HTML: sale de `/api/health` y se vuelca sobre
atributos `data-*`.

## Lo que nunca se commitea

`credentials/`, cualquier `*token*.json`, el `.env`, CSVs de clientes y los JSON
de órdenes. Las órdenes traen `customerName`, `email` y `province`: son datos
personales de clientas reales.

Si un token se filtró: **revocalo en la plataforma primero**. Borrar el commit
no invalida un token que ya salió del repositorio.
