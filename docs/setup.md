# Setup — cómo conseguir cada credencial

Cuatro integraciones, independientes entre sí. **El dashboard arranca sin
ninguna** y te dice en consola exactamente cuál falta; cada sección sin
configurar devuelve 503 con su motivo en vez de dejar la pantalla en blanco.

Hacelas en este orden:

| # | Qué | Sin esto | Tiempo |
|---|---|---|---|
| 1 | [Token de Meta](#meta) | No hay gasto, campañas ni ROAS | ~10 min |
| 2 | [Token de la tienda](#tienda) | No hay ingresos ni ROAS real | ~5 min |
| 3 | [Píxel + webhook](#pixel) | Meta pierde conversiones | ~15 min |
| 4 | [OpenRouter](#ia) | Solo se cae el análisis escrito | ~2 min |

Todo va al `.env` de la raíz. Arrancá copiando el ejemplo:

```bash
cp .env.example .env
```

---

<a id="meta"></a>

## 1. Token de Meta Ads

Necesitás un **System User Token**. No vence, que es lo que querés para algo que
corre solo. Un token sacado del Graph API Explorer se cae a los 60 días y te
deja el dashboard vacío un lunes a la mañana sin avisar.

### Antes de empezar

- Una cuenta de **Meta Business** (`business.facebook.com`) que sea dueña de la
  cuenta publicitaria.
- Rol de **administrador** en ese Business. Sin eso no ves *System Users*.
- Una **app** en `developers.facebook.com`. Sirve cualquiera: tipo *Business*,
  sin App Review. Anotá el **App ID** y el **App Secret**
  (App Settings → Basic).

> **App Review no hace falta** mientras leas tus propias cuentas publicitarias.
> El Standard Access de `ads_read` y `ads_management` alcanza. Advanced Access
> se pide solo para operar cuentas de terceros.

### Los pasos

1. **Business Settings → Accounts → Apps → Add.** Agregá tu app al Business.
   Este paso es el que más se saltea y produce el error *"the app is not
   associated with this business"* varios pasos después.

2. **Business Settings → Users → System Users → Add.** Creá uno (rol
   *Employee* alcanza) o usá el que ya tengas.

3. **Add Assets → Ad Accounts.** Seleccioná tu cuenta publicitaria y dale
   **Manage campaigns** al system user. Sin asignar el asset, el token se genera
   igual pero `/me/adaccounts` devuelve una lista vacía.

4. **Generate New Token.** Elegí la app del paso 1 y marcá:
   - `ads_read` — insights, campañas, gasto
   - `ads_management` — necesario para la Conversions API

5. **Copiá el token en ese momento.** No se vuelve a mostrar.

6. Pegalo en tu `.env`:

   ```bash
   META_ACCESS_TOKEN="EAAG..."
   META_APP_ID="123456789"
   META_APP_SECRET="abc123..."
   ```

   `META_APP_ID` y `META_APP_SECRET` son opcionales: solo habilitan la
   renovación automática, que un System User Token no necesita.

### Verificalo

```bash
npm run token:meta
```

Tiene que decir `Tipo: SYSTEM_USER` y `Vence: nunca`. Si dice `Tipo: USER` con
una fecha, sacaste un token de usuario y se te va a caer.

### Errores frecuentes

| Lo que ves | Qué pasó |
|---|---|
| `(#200) Requires ads_management permission` | Faltó marcar el scope al generar el token |
| `/me/adaccounts` devuelve `{"data": []}` | No le asignaste la cuenta publicitaria al system user (paso 3) |
| `Application does not have permission for this action` | La app no está agregada al Business (paso 1) |
| `Error validating access token: Session has expired` | Es un token de usuario, no de system user |
| `(#80004) There have been too many calls` | Rate limit de la cuenta. El caché de 10 min está justamente para esto; esperá y no bajes el TTL |

---

<a id="tienda"></a>

## 2. Token de la tienda (Tiendanube / Nuvemshop)

Tiendanube no tiene "API keys" en el panel del comerciante: hay que crear una
app y correr el flujo de OAuth, aunque la app sea tuya y para una sola tienda.

### Crear la app

1. Entrá a [partners.tiendanube.com](https://partners.tiendanube.com) y creá una
   cuenta de Partner. Es gratis y no requiere aprobación.
2. **Aplicaciones → Crear aplicación.**
3. Completá:
   - **URL de redirección:** `http://localhost:8123/callback`
     (tiene que ser exactamente esa; es donde escucha el script)
   - **Permisos:** `read_orders` como mínimo. `read_products` y `read_customers`
     si querés el histórico completo.
4. Anotá el **App ID** (es el `client_id`) y el **Client secret**. El secreto lo
   vas a necesitar dos veces: para el OAuth y para **verificar la firma de los
   webhooks**, así que dejalo en el `.env` y no lo borres después.

### Sacar el token

```bash
npm run setup:tiendanube
```

El script levanta un servidor local en el 8123, te da el link de instalación,
espera el callback, intercambia el `code` y guarda el resultado en
`credentials/tiendanube-token.json`. Al final te imprime las dos variables por
si preferís ponerlas en el `.env`:

```bash
TIENDANUBE_ACCESS_TOKEN="61181d08..."
TIENDANUBE_STORE_ID="789"
```

Para no tipear el secreto en consola, poné antes en el `.env`:

```bash
TIENDANUBE_APP_ID="123"
TIENDANUBE_CLIENT_SECRET="..."
```

### Verificalo

```bash
npm start
curl "http://localhost:3000/api/store/stats?datePreset=last_7d"
```

### Errores frecuentes

| Lo que ves | Qué pasó |
|---|---|
| `invalid_grant` | El `code` vence a los 5 minutos. Volvé a abrir el link |
| `redirect_uri_mismatch` | La URL en el panel no es idéntica a `http://localhost:8123/callback` |
| `401 Unauthorized` en la API | Falta `TIENDANUBE_STORE_ID` o no es el `user_id` que devolvió el OAuth |
| `403` con mensaje de scopes | La app no pidió `read_orders` |
| El webhook responde `401` | `TIENDANUBE_CLIENT_SECRET` no es el de esta app. Ver [webhook.md](webhook.md#firma) |
| La primera carga del histórico tarda | Es correcto: pagina de a 200 órdenes con 300 ms entre páginas para no comerse el rate limit. Se cachea 30 min |

El token **no vence**. Se invalida si generás otro o si desinstalan la app.

Documentación oficial:
[tiendanube.github.io/api-documentation](https://tiendanube.github.io/api-documentation/authentication)

### ¿Otra plataforma?

Ver [src/adapters/README.md](../src/adapters/README.md): es un archivo, y no se
toca nada más.

---

<a id="pixel"></a>

## 3. Píxel y webhook de conversiones

Esto es lo que hace que Meta vea las compras que el navegador pierde. Son tres
piezas y las tres tienen que estar, o no sirve.

### 3.1 El Pixel ID

**Events Manager → Data Sources.** Es el número de 15-16 dígitos al lado del
nombre del píxel.

```bash
META_PIXEL_ID="123456789012345"
```

Sin esto el webhook descarta el evento y lo avisa en el log, en vez de POSTear a
una URL con el id vacío.

### 3.2 Que la tienda pueda alcanzar tu servidor

En local necesitás un túnel:

```bash
ngrok http 3000
# o
cloudflared tunnel --url http://localhost:3000
```

Después, en el panel de Tiendanube (o vía API), registrá el webhook:

```
Evento:  order/paid
URL:     https://TU-TUNEL/webhook/store
```

> `/webhook/tiendanube` sigue funcionando como alias. Si ya lo tenías
> registrado, no lo cambies.

### 3.3 El `eventID` en el píxel del navegador — **esto es lo que se olvida**

El evento del servidor y el del navegador tienen que compartir un identificador
o Meta cuenta la compra **dos veces**, y el ROAS reportado sale al doble. El
servidor manda el id de la orden como `event_id`. El píxel tiene que mandar el
**mismo valor** como `eventID`, en la página de gracias:

```js
fbq('track', 'Purchase',
  { value: TOTAL_DE_LA_ORDEN, currency: 'ARS' },
  { eventID: ID_DE_LA_ORDEN }   // el mismo id que ve el servidor
);
```

Detalle completo y cómo verificarlo en [webhook.md](webhook.md).

> **Ojo:** Tiendanube también manda `Purchase` por Conversions API de forma
> nativa. Con eso puede haber **tres** eventos por compra. Verificá en
> Events Manager → Test Events antes de dar el setup por terminado.

### Verificalo

```
Events Manager → tu píxel → Test Events
```

Hacé una compra de prueba. Tenés que ver el `Purchase` llegando por *Server* y,
si el píxel está bien puesto, un aviso de **deduplicación**, no dos compras.

---

<a id="ia"></a>

## 4. OpenRouter (opcional)

Solo alimenta el botón *Analizar* de la pestaña Meta Ads. Sin key devuelve 503 y
nada más cambia.

1. Creá cuenta en [openrouter.ai](https://openrouter.ai) y cargá saldo.
2. **Keys → Create key.**

```bash
OPENROUTER_API_KEY="sk-or-v1-..."
OPENROUTER_MODEL="anthropic/claude-haiku-4.5"
```

El modelo se elige en [openrouter.ai/models](https://openrouter.ai/models). Con
un análisis por período y caché por contenido, el consumo es de centavos.

> **Evitá los modelos `:free` para esto.** En la práctica devolvían su propia
> cadena de razonamiento, en inglés, arriba de la respuesta. Hay un saneado
> determinista que corta todo lo anterior a la primera sección
> (`src/services/ai.js`), pero es un parche, no una solución.

---

## Ya está: qué mirar ahora

```bash
npm start
```

En consola tenés el estado de las cuatro integraciones. En el navegador:

- **Resumen** — el ROAS real, la comparación y *Qué mirar*.
- **Meta Ads** — embudo, campañas, frecuencia, tabla.
- **Tienda** — el histórico completo.

Si algo no aparece, `http://localhost:3000/api/health` dice qué está configurado
y qué no, sin exponer ningún valor.
