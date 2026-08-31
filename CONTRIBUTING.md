# Contribuir

Gracias por mirar el código. Esto es chico y quiere seguir siéndolo.

## Arrancar

```bash
npm install
cp .env.example .env    # se puede dejar vacío: el dashboard arranca igual
npm run dev
npm run check           # lint + tests, lo mismo que corre CI
```

No hacen falta credenciales para desarrollar ni para correr los tests: montan la
app entera con adaptadores falsos y no tocan la red.

## Qué entra

Esto es un dashboard de **ROAS real**: plata cobrada dividido gasto
publicitario. Ese es el alcance.

Entra fácil:

- **Adaptadores de otras plataformas** (Shopify, WooCommerce, VTEX). Es lo que
  más suma y lo que menos toca el resto. Ver
  [src/adapters/README.md](src/adapters/README.md).
- **Correcciones** con un test que falle antes del arreglo.
- **Documentación** de un paso que te costó.

Conviene abrir un issue antes:

- Métricas nuevas en el Resumen. Hay un tope de cuántas puede leer alguien de
  un vistazo, y ya está cerca.
- Persistencia, base de datos, autenticación. Son cambios de forma, no de
  contenido.
- Dependencias nuevas. Hoy hay dos en runtime y se defienden solas.

## Las reglas del código

Salen de haber roto esto en producción, no de un manual de estilo.

1. **Ningún pedido externo sin timeout.** Se hacen por `lib/http.js`, que lo
   impone. Sin timeout, un pedido queda colgado para siempre: ni error ni
   resultado, la pantalla en blanco y nadie sabe por qué.

2. **Ningún endpoint nuevo sin caché.** Pasalo por `cache.wrap`. Sin eso, cada
   clic le pega de nuevo a las APIs.

3. **Falta una credencial → `503` con el nombre de la variable.** Nunca un
   crash, nunca un `500` genérico, nunca un cero que parece un dato.

4. **Las fechas salen de `lib/dates.js`.** No calcules un rango en una ruta.
   Ya pasó tres veces y las tres copias se corrían un día distinta.

5. **Nada de la plataforma fuera de su adaptador.** Si escribiste
   `contact_email` o `shipping_address` en un service o en una ruta, algo se
   filtró.

6. **Las funciones de `services/analytics.js` son puras.** Entran pedidos, salen
   números. Sin red, sin `Date.now()`, sin estado. Eso es lo que las hace
   testeables.

7. **Fallar a la vista.** Cada evento descartado, cada validación que se saltea,
   se dice. La peor falla es la que parece éxito.

8. **El dashboard informa, no opina.** Nada de "te está yendo bien" ni "en
   verde". Métrica, valor, variación, definición. El juicio lo pone quien lee.
   Ver [docs/diseno.md](docs/diseno.md).

9. **Ninguna señal por color solo.** Toda variación en verde o rojo lleva
   además una palabra o un signo.

10. **Todo lo que entra de afuera se verifica.** El webhook chequea la firma
    antes de tocar el payload. Un endpoint público cuyo contenido se reenvía a
    otra API es una vía de inyección si no lo hacés.

11. **Ningún secreto en el código, ni en un test, ni en un ejemplo del README.**

## Frontend

Scripts clásicos cargados en orden, sin bundler, compartiendo el scope global.
Es deliberado: se abre el archivo y se lee.

El precio es que un nombre mal escrito no falla hasta que el usuario hace clic.
La red es `no-undef` de ESLint. **Si agregás un global que cruza archivos,
declaralo en `eslint.config.js`** o el lint no te va a cubrir.

Nada del negocio va escrito en el HTML: sale de `/api/health` y se vuelca sobre
atributos `data-*`. Si vas a poner un nombre, una moneda o un rótulo fijo,
pasalo por ahí.

## Commits y PRs

- Mensajes en imperativo y en la línea de lo que ya hay:
  `fix(webhook): mandar event_id para que Meta deduplique`.
- Un PR, un tema. Si son dos, son dos PRs.
- En la descripción: **qué se rompía antes**. Es lo único que un revisor no
  puede deducir del diff.
- `npm run check` en verde.

## Tests

`node:test`, sin dependencias.

Un test bueno acá describe el comportamiento, no la implementación:

```js
test('el event_id es el id de la orden: sin eso Meta cuenta la compra dos veces', () => { … });
```

Para un bug, escribí primero el test que falla. Para un adaptador nuevo,
`test/adapters.test.js` con un payload real recortado.

## Reportar un bug

Contá qué esperabas, qué pasó, y pegá la salida de:

```bash
curl http://localhost:3000/api/health
```

No devuelve ningún valor de credencial, así que se puede pegar entera.

**Si el bug es de seguridad, no abras un issue.** Ver [SECURITY.md](SECURITY.md).
