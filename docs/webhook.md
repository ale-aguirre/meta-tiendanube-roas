# Webhook → Conversions API de Meta

El píxel del navegador pierde conversiones: bloqueadores de anuncios, ITP en
iOS, gente que cierra la pestaña antes de que el evento dispare. Se pierde
justamente el evento que más importa, el `Purchase`, porque ocurre al final.

La solución de Meta es mandar el evento **desde el servidor**, donde no hay
navegador que interceptar.

```
tienda: orden pagada
  │
  ├─ POST /webhook/store
  │     └─ responde 200 al instante, antes de procesar
  │
  ├─ el adaptador normaliza la orden
  ├─ SHA-256 del email, en minúsculas y sin espacios
  └─ POST graph.facebook.com/v21.0/{PIXEL_ID}/events
```

<a id="firma"></a>

## Antes que nada: la firma

El endpoint está abierto a internet — tiene que estarlo, o la tienda no llega.
Lo que le POSTees, se lo manda a Meta. **Sin verificar la firma, cualquiera que
conozca la URL puede inventarse una compra de $999.000** y el dashboard se la
reenvía a la Conversions API: se ensucia la optimización de las campañas y el
ROAS que Meta reporta.

Tiendanube firma el cuerpo crudo con HMAC-SHA256 usando el **client secret de tu
app** y manda el resultado en `x-linkedstore-hmac-sha256`.

```bash
TIENDANUBE_CLIENT_SECRET="el mismo que usaste para el OAuth"
```

Con eso puesto, un POST sin firma o con firma que no coincide se rechaza con
`401` y no llega nada a Meta. La comparación es en tiempo constante: un `===`
filtra cuántos caracteres coinciden y deja adivinar la firma byte por byte.

**Sin el secreto el webhook acepta todo**, para no romper instalaciones que ya
andaban. El arranque te avisa, y cada orden aceptada así queda marcada en el
log:

```
AVISO: Falta TIENDANUBE_CLIENT_SECRET — el webhook acepta cualquier POST sin verificar la firma.
[webhook] Orden #482 aceptada SIN verificar la firma.
```

La firma se calcula sobre **los bytes exactos que llegaron**, por eso el cuerpo
crudo se guarda antes de parsear: reserializar el JSON cambia el espaciado y el
hash deja de coincidir aunque el contenido sea idéntico.

Documentación:
[tiendanube.github.io/api-documentation/resources/webhook](https://tiendanube.github.io/api-documentation/resources/webhook)

## Las tres cosas que hay que hacer bien

Las tres se ven idénticas si están mal. Ninguna tira error.

### 1. `event_id` — o cada compra se cuenta dos veces

Meta deduplica por **`event_id` + `event_name`**. El `order_id` dentro de
`custom_data` **no sirve** para eso: Meta lo ignora al deduplicar.

Sin `event_id`, cada compra entra dos veces —una por el píxel, otra por el
webhook— y el ROAS que reporta Meta sale al doble. Que es la única métrica del
proyecto.

El servidor manda el id de la orden:

```js
event_id: String(order.id)
```

y el píxel del navegador tiene que mandar **ese mismo valor**, en la página de
gracias de la tienda:

```js
fbq('track', 'Purchase',
  { value: TOTAL_DE_LA_ORDEN, currency: 'ARS' },
  { eventID: ID_DE_LA_ORDEN }   // el mismo id, no el número de orden visible
);
```

> Ojo con la diferencia entre el **id** interno de la orden y el **número** que
> ve el comprador. El servidor usa el id. Si el píxel manda el número, no
> aparean.

### 2. `event_time` — cuándo se compró, no cuándo llegó el webhook

```js
event_time: Math.floor(new Date(order.createdAt).getTime() / 1000)
```

Si el webhook se demora —y se demora: reintentos, cola, tu servidor dormido— los
dos eventos caen en ventanas distintas y Meta ya no los puede aparear aunque el
`event_id` coincida. En una prueba real hubo **92.000 segundos** de diferencia
usando `Date.now()`.

### 3. El email, hasheado, y nada más

```js
user_data: { em: [sha256(email.toLowerCase().trim())] }
```

El email es el único identificador que se manda. Antes, si la orden no traía
email, se hasheaba la **dirección** como reemplazo: eso no matchea con nada en
Meta y encima manda un dato personal al pedo. Sin email, va sin.

El email nunca sale en claro.

## El evento completo

```json
{
  "event_name": "Purchase",
  "event_id": "1234567",
  "event_time": 1755712991,
  "event_source_url": "https://mitienda.com",
  "action_source": "website",
  "user_data": {
    "em": ["8f7c…"],
    "client_user_agent": "Dashboard/Server"
  },
  "custom_data": {
    "currency": "ARS",
    "value": 48900,
    "order_id": "1234567",
    "contents": [{ "id": "77", "quantity": 2, "item_price": 18900 }]
  }
}
```

`event_source_url` se omite si `SITE_URL` está vacío, en vez de mandarse en
blanco.

## Sin `META_PIXEL_ID`

El evento **se descarta y se avisa**:

```
[capi] Evento descartado (orden #482): META_PIXEL_ID no está configurado.
```

Antes esto POSTeaba a `/v21.0//events` con el píxel vacío, fallaba, y el error
quedaba enterrado en un log que nadie mira. Una falla que parece éxito es peor
que una falla.

## Configurarlo

En local hace falta un túnel, porque la tienda tiene que poder alcanzarte:

```bash
ngrok http 3000
```

En el panel de Tiendanube, o vía API:

```
Evento:  order/paid
URL:     https://TU-TUNEL/webhook/store
```

`/webhook/tiendanube` sigue funcionando como alias: si ya lo tenías registrado,
no lo toques.

**Sin el webhook el dashboard funciona igual.** Perdés el envío server-side de
conversiones, no las métricas.

## Verificarlo

```
Events Manager → tu píxel → Test Events
```

Hacé una compra de prueba. Lo que tenés que ver:

| Lo que ves | Qué significa |
|---|---|
| Un `Purchase` por *Browser* y otro por *Server*, con aviso de deduplicación | Correcto |
| Dos `Purchase` contados por separado | Los `event_id` no coinciden |
| Solo *Server* | El píxel del navegador no está disparando |
| Tres `Purchase` | Ver abajo |

### El tercer evento

**Tiendanube también manda `Purchase` por Conversions API de forma nativa** si
tenés la integración de Meta activada en la tienda. Con eso puede haber tres
eventos por compra: píxel, Tiendanube y este webhook.

Decidí uno de los dos server-side y apagá el otro. No hay forma de deduplicar
contra un evento cuyo `event_id` no controlás.

## Debug local

`META_GRAPH_HOST` apunta la Conversions API a un servidor tuyo, para ver el
evento que sale de verdad:

```bash
META_GRAPH_HOST=localhost:9000 npm start
```

Si incluye un puerto, usa HTTP en vez de HTTPS. **En producción no se define.**

El registro de lo que se envió queda en `logs/dashboard.log`. Es escritura
asíncrona: `appendFileSync` bloquea el event loop mientras la tienda espera la
respuesta, y la tienda reintenta si tardás.
