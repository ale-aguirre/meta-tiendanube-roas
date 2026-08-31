# Seguridad

## Reportar una vulnerabilidad

**No abras un issue público.** Usá *Security → Report a vulnerability* en
GitHub, o escribí al mail del mantenedor.

Contá qué se puede hacer con el bug y cómo reproducirlo. Respondo apenas puedo;
esto lo mantiene una persona, no un equipo.

## El modelo de amenaza, en una línea

**Este dashboard no tiene autenticación.** Cualquiera que llegue al puerto ve el
gasto publicitario, los ingresos, los productos y los nombres de los
compradores. Está pensado para correr en `localhost`.

`HOST` es `127.0.0.1` por defecto, no `0.0.0.0`, justamente por eso.

Si lo exponés a una red, ponele adelante un reverse proxy con login. No hay
"modo seguro" para saltearlo.

## Qué hace el proyecto para no empeorar las cosas

- **Ningún secreto en el código.** Todo sale del `.env` o de `credentials/`, que
  está entero en `.gitignore` salvo su README.
- **CORS cerrado por defecto.** `ALLOWED_ORIGINS` vacío = solo mismo origen. Con
  `*`, cualquier página que el usuario visite podría leer sus métricas desde
  localhost; el arranque avisa si lo configurás así.
- **Nunca `*` en el eco de origen.** Se responde el origen exacto que pidió, y
  solo si está en la lista.
- **`/api/health` no devuelve valores de credenciales**, solo si están o no. Hay
  un test que lo verifica.
- **El email sale hasheado con SHA-256** hacia Meta, nunca en claro.
- **No se persisten datos de clientes.** Todo vive en memoria con TTL. Lo único
  que se escribe a disco es el log de qué órdenes se enviaron a Meta.
- **El webhook verifica la firma HMAC-SHA256** del cuerpo crudo contra el client
  secret de la app, en tiempo constante. Sin eso, quien conozca la URL puede
  inyectarle a Meta una compra que nunca existió. Ver
  [docs/webhook.md](docs/webhook.md#firma).
- **Sin `eval`, sin `child_process` para datos de red.** Lo único que se ejecuta
  es abrir el navegador al arrancar, con una URL propia.

## Lo que se sacó y por qué

- **`POST /api/open-claude`** abría una terminal en la máquina del usuario. Con
  CORS en `*`, cualquier sitio web podía dispararlo. Eliminado.
- **`Access-Control-Allow-Origin: *`** en todas las respuestas. Reemplazado por
  una lista explícita, vacía por defecto.

## Datos personales

Las órdenes traen **nombre, email, dirección y teléfono de gente real**. Eso es
lo más sensible que toca el proyecto, más que los tokens.

- Los archivos de órdenes, los CSV y los logs están en `.gitignore`.
- `GET /api/store/orders` los devuelve crudos. Está para debug: si los mandás a
  otro lado, es tu responsabilidad.
- `FEATURE_INFER_GENDER` está **apagada por defecto**. Es una inferencia sobre
  datos personales que se equivoca, depende del país y no aplica a todo el
  mundo. Ver [docs/configuracion.md](docs/configuracion.md#genero).

## Si se te filtró un token

En este orden:

1. **Revocalo en la plataforma.** Meta: Business Settings → System Users →
   revocar el token. Tiendanube: desinstalar la app o generar uno nuevo, que
   invalida el anterior.
2. Recién después limpiá el historial de git.

Borrar un commit **no invalida un token que ya salió del repositorio**. Asumí
que alguien lo tiene.

## Versiones

Se soporta la última versión publicada. Node ≥20.
