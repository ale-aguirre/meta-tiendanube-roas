# Configuración

Todo sale de variables de entorno, leídas del `.env` de la raíz. La plantilla
completa está en [`.env.example`](../.env.example); esta página explica qué hace
cada una y cuándo importa.

Nada es obligatorio. **El dashboard arranca con todo vacío** y lista en consola
lo que falta; cada sección sin credencial devuelve 503 con su motivo.

Quién manda cuando hay dos fuentes: **el `.env` gana** sobre los archivos de
`credentials/`, que existen por compatibilidad con instalaciones viejas y porque
el token de Meta tiene que poder reescribirse solo
(ver [credentials/README.md](../credentials/README.md)).

---

## Tu negocio

| Variable | Default | Para qué |
|---|---|---|
| `BUSINESS_NAME` | `Mi Tienda` | Título, encabezado y prompt de la IA |
| `BUSINESS_TYPE` | `tiendas de e-commerce` | Contexto del prompt de la IA |
| `SITE_URL` | *(vacío)* | `event_source_url` de los eventos a Meta |
| `APP_CONTACT_EMAIL` | `contacto@example.com` | `User-Agent` de las llamadas a la tienda |
| `CURRENCY` | `ARS` | Rótulos y moneda por defecto de los eventos |
| `LOCALE` | `es-AR` | Formato de números y fechas |

El frontend lee estos valores de `/api/health` al arrancar. **No hay nada del
negocio escrito en el HTML**: el mismo `index.html` sirve para cualquier tienda.

Sin `SITE_URL` los eventos salen sin `event_source_url` en vez de con uno vacío,
que Meta rechaza.

## Meta Ads

| Variable | Default | Para qué |
|---|---|---|
| `META_ACCESS_TOKEN` | *(vacío)* | Token de System User. → [setup](setup.md#meta) |
| `META_APP_ID` | *(vacío)* | Solo para renovación automática |
| `META_APP_SECRET` | *(vacío)* | Solo para renovación automática |
| `META_PIXEL_ID` | *(vacío)* | Sin esto el webhook no manda nada |
| `META_API_VERSION` | `v21.0` | Versión del Graph API |
| `META_TOKEN_AUTO_REFRESH` | `true` | Chequeo al arrancar y cada 24 h |
| `META_GRAPH_HOST` | `graph.facebook.com` | **Solo tests.** Ver abajo |

`META_GRAPH_HOST` existe para apuntar la Conversions API a un servidor local y
mirar el evento que sale de verdad, byte por byte. Si incluye un puerto
(`localhost:9000`) usa HTTP en vez de HTTPS. **En producción no se define.**

La renovación automática solo hace algo si están el App ID y el App Secret. Un
System User Token no vence (`expires_at: 0`), así que es una red de seguridad.

## La tienda

| Variable | Default | Para qué |
|---|---|---|
| `STORE_PLATFORM` | `tiendanube` | Qué adaptador se usa |
| `TIENDANUBE_ACCESS_TOKEN` | *(vacío)* | → [setup](setup.md#tienda) |
| `TIENDANUBE_STORE_ID` | *(vacío)* | El `user_id` que devuelve el OAuth |
| `TIENDANUBE_APP_ID` | *(vacío)* | Solo para correr el OAuth |
| `TIENDANUBE_CLIENT_SECRET` | *(vacío)* | OAuth **y** firma del webhook. Ver abajo |

**`TIENDANUBE_CLIENT_SECRET` no es opcional si usás el webhook.** Es la clave
con la que Tiendanube firma cada webhook. Sin ella el endpoint acepta cualquier
POST, y quien conozca la URL puede inyectarle a Meta una compra que nunca pasó.
El arranque avisa cuando hay píxel configurado y no hay secreto.

`STORE_PLATFORM` con un valor que no existe **no arranca**, y el error dice qué
adaptadores hay. Es a propósito: un typo silencioso acá deja el dashboard sin
ingresos y el ROAS sin denominador.

## IA (opcional)

| Variable | Default | Para qué |
|---|---|---|
| `AI_ENABLED` | `true` | Apagalo para deshabilitar `/api/analyze` sin borrar la key |
| `OPENROUTER_API_KEY` | *(vacío)* | → [setup](setup.md#ia) |
| `OPENROUTER_MODEL` | `anthropic/claude-haiku-4.5` | Se elige en openrouter.ai/models |
| `OPENROUTER_MAX_TOKENS` | `700` | Tope de la respuesta |

Las reglas de *Qué mirar* de la pestaña Resumen **no usan esto**: son
deterministas y corren sin API key.

## Servidor

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Solo local. Ver abajo |
| `ALLOWED_ORIGINS` | *(vacío)* | Orígenes CORS, separados por coma |
| `NO_OPEN` | *(vacío)* | `1` evita abrir el navegador al arrancar |
| `OPEN_BROWSER` | `true` | Lo mismo, al revés |

**`HOST=127.0.0.1` es deliberado.** El dashboard **no tiene autenticación**:
cualquiera que llegue al puerto ve el gasto publicitario, los ingresos y los
nombres de los compradores. Si lo ponés en `0.0.0.0` para exponerlo, ponele
antes un reverse proxy con login.

**`ALLOWED_ORIGINS` vacío significa solo mismo origen**, que es todo lo que el
dashboard necesita: sirve su propio frontend. Nunca pongas `*` — cualquier
página que el usuario visite podría leer sus métricas desde localhost. El
arranque avisa si lo hacés.

## Caché

| Variable | Default | Para qué |
|---|---|---|
| `CACHE_TTL_MINUTES` | `10` | Métricas de Meta y de la tienda |
| `ANALYTICS_CACHE_TTL_MINUTES` | `30` | Histórico completo de la tienda |

El caché no es una optimización opcional. Sin él, cada clic le pega de nuevo a
las dos APIs: te acercás al rate limit de Meta y quemás tokens de IA con datos
idénticos. Bajarlo mucho reintroduce ese problema; el histórico son cientos de
páginas y por eso tiene su propio TTL.

Es en memoria: reiniciar el proceso lo vacía. No persiste nada en disco.

<a id="genero"></a>

## Features

| Variable | Default | Para qué |
|---|---|---|
| `DEMO_MODE` | `false` | Datos sintéticos en lugar de Meta y la tienda |
| `FEATURE_INFER_GENDER` | `false` | Infiere género por nombre de pila |

Con **`DEMO_MODE=1`** se reemplazan las dos integraciones por generadores
sintéticos (`src/demo/`) y no se toca la red. Los números son deterministas: la
misma fecha da siempre lo mismo, así una captura se puede repetir y un bug en la
interfaz no se confunde con ruido del generador.

No hay nada real ahí: productos, campañas y compradores están inventados, y los
emails usan `ejemplo.com`, que la IANA reserva justamente para esto.


Apagada por defecto, y conviene dejarla así salvo que sepas para qué la querés.
Es una inferencia sobre datos personales contra un diccionario de nombres
frecuentes en Argentina (`src/data/nombres-ar.json`): se equivoca, depende del
país y no aplica a nadie fuera del binario. Con la feature apagada,
`/api/store/analytics` devuelve `genero: null` y el frontend directamente no
dibuja la tarjeta.

## Rutas

| Variable | Default | Para qué |
|---|---|---|
| `CREDENTIALS_DIR` | `./credentials` | Dónde viven los archivos de credenciales |
| `LOG_DIR` | `./logs` | Dónde se escribe `dashboard.log` |

Los dos están en `.gitignore`. El log incluye qué órdenes se enviaron a Meta:
tratalo como dato de negocio, no como ruido.
