# Estado y roadmap

Qué está hecho, qué falta, y qué falta **a propósito**. Escrito para que quien
llegue al repo sepa dónde se metió antes de invertir una tarde.

Esto corrió en producción sobre una tienda real durante meses antes de
publicarse. Lo que está acá no es una lista de intenciones: es lo que quedó
después de romperlo.

## Lo que está resuelto y verificado

**El cruce.** Los dos lados miden el mismo período cerrado, alineado a
medianoche local. Suena obvio y no lo es: durante meses las ventas de la tienda
incluían el día en curso y el gasto de Meta no, así que el cociente comparaba
períodos distintos. La lógica vive en un solo archivo, `src/lib/dates.js`, con
tests que incluyen el cruce de fin de año.

**El webhook a la Conversions API.** Cuatro bugs, los cuatro confirmados contra
la API real:

- Faltaba `event_id`. Meta deduplica por `event_id` + `event_name`; el
  `order_id` iba en `custom_data`, donde Meta lo ignora para eso. Cada compra
  podía contarse dos veces e inflar el ROAS.
- `event_time` usaba `Date.now()` en vez de la fecha de la orden. En la prueba
  había 92.000 segundos de diferencia.
- Si la orden no traía email se hasheaba la dirección como reemplazo. No matchea
  con nada en Meta y manda un dato personal al pedo.
- No se verificaba la firma. El endpoint está abierto a internet y lo que recibe
  se lo manda a Meta: cualquiera que conociera la URL podía inyectar una compra
  que nunca existió.

**Meta contaba las compras dos veces** en los insights, porque se sumaban
`omni_purchase` y `purchase`, que son la misma compra.

**Nada del negocio está escrito en el HTML.** Nombre, moneda y locale salen de
`/api/health`. El mismo `index.html` sirve para cualquier tienda.

**La plataforma de e-commerce es reemplazable.** Todo lo que sabe de Tiendanube
está en un archivo. Ver [../src/adapters/README.md](../src/adapters/README.md).

## La pestaña Resumen

Es la home. Meta Ads y Tienda quedaron como pestañas.

En orden: métrica principal, cuatro métricas comparadas contra el período
anterior, bloque *Qué mirar*, tarjetas de campañas con costo por venta, y
gráfico de ventas por día.

**Las reglas de *Qué mirar* son deterministas** (`public/js/summary.js`,
`evaluarReglas()`): sin LLM, sin latencia, sin API key, misma entrada igual
salida. Detectan campañas que cuestan más que el ticket promedio, campañas con
gasto y cero compras, discrepancia entre Meta y la caja, gasto que sube mientras
bajan los ingresos, y CTR bajo.

Hubo un análisis con LLM acá y **se sacó**: un modelo gratuito devolvía su propio
razonamiento en inglés y el dashboard lo mostraba como si fuera el análisis. El
análisis escrito sigue existiendo, pero en la pestaña Meta Ads, opcional, y con
un saneado determinista.

## El margen, decidido

**El titular es siempre el ROAS.** Esto es un dashboard de ROAS, no una
calculadora de ganancia. Un titular que cambia según un campo que el usuario
puede o no cargar deja de prometer una cosa sola.

El campo de margen existe pero vive al pie de *Qué mirar*, como dato opcional.
Habilita una sola cosa, que es la que justifica que exista: el **punto de
equilibrio** (`100 / margen`), el único umbral que ni Meta ni la tienda conocen.
El valor vive en `localStorage` y nunca viaja al servidor.

## Lo que falta

- **El gráfico superpone gasto sobre ingresos con escalas distintas.** Es un
  patrón desaconsejado explícitamente; hay evidencia en contra y dos
  alternativas documentadas en [referencias.md](referencias.md). Sin decidir.
- **El píxel del navegador tiene que mandar el mismo `eventID`.** Sin eso no hay
  deduplicación aunque el server esté perfecto. Y Tiendanube manda `Purchase`
  por Conversions API de forma nativa, así que puede haber tres eventos por
  compra. Ver [webhook.md](webhook.md).
- **Sin tendencia.** La comparación es un período contra el anterior. Eso es una
  foto, no una tendencia.
- **El gráfico diario no responde qué día conviene gastar más**, que sería ROAS
  por día en vez de ingresos por día.
- **Sin autenticación.** Corre en `127.0.0.1` a propósito. Ver
  [../SECURITY.md](../SECURITY.md).
- **El frontend no tiene tests.** El backend sí. La red contra los errores de
  nombres es `no-undef` de ESLint.
- **La primera carga del histórico tarda.** Con ~1.000 órdenes son unos 80
  segundos, porque pagina de a 200 con pausa por rate limit. Después cachea 30
  minutos. Precalentarlo al arrancar resolvería la primera impresión.

## Lo que no está, y es a propósito

- **No hay base de datos.** Todo es en memoria con TTL. Sumarla cambia la forma
  del proyecto: deja de ser algo que clonás y corrés.
- **No hay multi-tienda.** Una instalación, una tienda. Es lo que hace que la
  interfaz pueda ser tan directa.
- **No opina.** Nada de "te está yendo bien" ni "en verde". Métrica, valor,
  variación, definición. El juicio lo pone quien lee. Ver [diseno.md](diseno.md).
