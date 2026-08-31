# API

Todas las respuestas son JSON. Los errores salen como `{ "error": "mensaje" }`
con el código correspondiente:

| Código | Qué significa |
|---|---|
| `400` | Parámetro inválido o error que devolvió Meta |
| `404` | Ruta inexistente bajo `/api` |
| `503` | Falta una credencial. El mensaje dice cuál y apunta a `docs/setup.md` |
| `500` | Algo se rompió. Queda en `logs/dashboard.log` |

Un 503 **no es una falla**: es el estado normal de una integración sin
configurar. Por eso no ensucia el log.

## Períodos

Donde dice `datePreset`, los valores válidos son:

```
today  yesterday  last_7d  last_14d  last_30d  last_90d
this_month  last_month  this_year
```

Cualquier otro devuelve `400`. Son los mismos nombres que usa el `date_preset`
de Meta, y se resuelven **exactamente igual**: rangos `[inicio, fin)` alineados
a medianoche local, con `last_7d` = los 7 días cerrados anteriores a hoy.

Que los dos lados midan el mismo período no es un detalle: si el gasto incluyera
hoy y los ingresos no, el cociente de los dos no sería el ROAS de nada. Toda esa
lógica vive en un solo archivo, `src/lib/dates.js`, con tests.

---

## Estado

### `GET /api/health`

Qué está configurado y qué no. **No devuelve ningún valor de credencial** —
sirve para que el frontend sepa qué puede pedir y para un monitor externo.

```json
{
  "status": "ok",
  "uptimeSeconds": 412,
  "business": "Mi Tienda",
  "currency": "ARS",
  "locale": "es-AR",
  "integrations": {
    "meta": { "configured": true },
    "store": { "platform": "tiendanube", "name": "Tiendanube", "configured": true },
    "conversionsApi": { "configured": false },
    "ai": { "configured": true, "model": "anthropic/claude-haiku-4.5" }
  },
  "features": { "inferGender": false }
}
```

---

## El cruce

### `GET /api/summary/comparison`

El endpoint que da sentido al proyecto: el mismo período cerrado medido en las
dos plataformas, contra el período anterior de la misma duración.

**Parámetros:** `accountId` (`act_…`, requerido), `datePreset`

```json
{
  "comparable": true,
  "current":  { "meta": { "spend": 177510.99, "impressions": 27438, "clicks": 1924, "purchases": 12 },
                "tn":   { "orders": 15, "revenue": 982492 } },
  "previous": { "meta": { "spend": 174237.80, "impressions": 24897, "clicks": 1811, "purchases": 22 },
                "tn":   { "orders": 22, "revenue": 1156631.20 } },
  "ranges": {
    "current":  { "start": "2026-08-18", "end": "2026-08-24" },
    "previous": { "start": "2026-08-11", "end": "2026-08-17" }
  }
}
```

Las fechas de `ranges` son **inclusivas en los dos extremos**: son las que el
frontend imprime ("17 al 23 ago") y las que usa para recortar el gráfico diario
al mismo rango que las métricas de arriba.

Un período **en curso** no se compara, y lo dice:

```json
{ "comparable": false, "reason": "El período todavía está en curso; no hay un período anterior equivalente cerrado." }
```

Medio día contra un día entero da una caída que no existe. Antes que inventar
una comparación, no hay comparación.

`purchases` sale de `omni_purchase`, o de `purchase` si aquel falta — **nunca
los dos sumados**. Meta devuelve la misma compra en las dos filas.

---

## Meta Ads

Todos cachean 10 minutos y exigen `accountId` con formato `act_<dígitos>`.

| Endpoint | Devuelve |
|---|---|
| `GET /api/accounts` | Cuentas publicitarias visibles para el token |
| `GET /api/campaigns?accountId=` | Campañas con presupuesto, objetivo y estado |
| `GET /api/insights?accountId=&datePreset=&level=` | Gasto, impresiones, CTR, CPM, frecuencia, acciones |
| `GET /api/insights/daily?accountId=&datePreset=` | La misma serie con `time_increment=1` |

`level` acepta `account`, `campaign` (default), `adset`, `ad`.

Los errores de Meta llegan con `200` y un `error` en el body. El dashboard los
traduce a `400` con el mensaje: un token vencido tiene que verse como un error,
no como una cuenta sin gasto.

---

## La tienda

Montados en **`/api/store`**. `/api/tn` sigue funcionando como alias.

Ninguno menciona Tiendanube: hablan con el adaptador de
`STORE_PLATFORM` ([contrato](../src/adapters/README.md)).

### `GET /api/store/info`

```json
{ "id": "tiendanube", "name": "Tiendanube", "configured": true }
```

### `GET /api/store/stats?datePreset=`

El resumen del período. Es el lado "caja" del ROAS real.

```json
{
  "orders": 15,
  "revenue": 982492,
  "avgTicket": 65499.47,
  "shippingTotal": 118377,
  "topProducts":  [{ "name": "Conjunto Lila", "qty": 5, "revenue": 224825 }],
  "revenueByDay": [{ "date": "2026-08-18", "revenue": 184716 }],
  "abandoned":    [{ "number": "481", "name": "Ana", "total": 42500, "created_at": "…", "payment_method": "credit_card", "products": "Conjunto Lila" }],
  "abandonedCount": 7,
  "abandonedTotal": 289400
}
```

`abandoned` se recorta a 10 para mostrar; `abandonedCount` y `abandonedTotal`
cuentan **todos**. Un resumen que oculta que hay más de lo que muestra miente.

### `GET /api/store/analytics`

Histórico completo: provincias, productos, medios de pago, evolución mensual,
día y hora pico, rangos de ticket, recompra y cupones.

Es la consulta más cara — recorre todas las páginas de órdenes de la tienda —
así que cachea 30 minutos.

La hora se toma de la **zona horaria del pedido**, leída del offset del propio
timestamp. Con UTC, la "hora pico" de una tienda argentina salía tres horas
corrida.

`genero` es `null` salvo que prendas `FEATURE_INFER_GENDER`
([por qué](configuracion.md#genero)).

### `GET /api/store/orders?datePreset=` · `GET /api/store/abandoned`

Las órdenes normalizadas, crudas. Útiles para debug y para exportar.

> Traen `email`, `customerName` y `province` de gente real. Si los mandás a otro
> lado, es tu responsabilidad.

---

## Webhook

### `POST /webhook/store`

Alias: `POST /webhook/tiendanube` (la URL que ya está registrada en el panel).

Verifica la firma HMAC **antes de todo**: un POST sin firma o con firma que no
coincide se rechaza con `401` y no llega nada a Meta. Sin
`TIENDANUBE_CLIENT_SECRET` configurado acepta todo y lo avisa en el log.

Si la firma pasa, responde `200 {"ok": true}` **antes de procesar**. La tienda
reintenta el webhook si no recibe respuesta rápido, y un reintento sería una
conversión duplicada.

El detalle completo está en [webhook.md](webhook.md).

---

## Análisis con IA

### `POST /api/analyze`

```json
{ "metaData": { "spend": 177510, "purchases": 12, "ctr": 1.4, "cpm": 6470 },
  "tnData":   { "orders": 15, "revenue": 982492, "avgTicket": 65499 },
  "datePreset": "last_7d" }
```

```json
{ "analysis": "DIAGNÓSTICO:\n…", "model": "anthropic/claude-haiku-4.5" }
```

Cachea por **hash del contenido**: los mismos datos de entrada devuelven la
respuesta guardada sin volver a pagar tokens.

La respuesta pasa por un saneado determinista que corta todo lo anterior a la
primera sección esperada y elimina los bloques `<think>`. Existe porque algunos
modelos devuelven su cadena de razonamiento —a veces en inglés— arriba de la
respuesta, y el dashboard la mostraba como si fuera el análisis.

Sin `OPENROUTER_API_KEY`, o con `AI_ENABLED=false`: `503`.
