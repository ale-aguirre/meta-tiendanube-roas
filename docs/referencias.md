# Referencias: cómo lo resuelven los productos que ya existen

Este archivo existe para no volver a inventar decisiones de presentación. Antes
de escribir un texto de UI o elegir cómo se muestra una métrica, mirar acá.
Si el patrón no está, buscarlo en productos reales y agregarlo con la fuente.

## Comparación contra el período anterior

**El problema que teníamos.** Decíamos `-33.0% (antes $79K)`. "Antes" no dice
antes de qué. Estaba en las cuatro métricas.

**Qué hacen los demás:**

- **Google Ads.** Al activar la comparación, la tabla se expande y muestra el
  rango de fechas actual, el rango anterior, el cambio numérico y el
  porcentual. Los rótulos del selector son "Previous period" (default),
  "Previous year" y "Custom".
  https://support.google.com/google-ads/answer/2454008
- **Meta Ads Manager.** Toggle "Compare" en el filtro de fechas, con las mismas
  opciones. El período anterior se muestra en gris.
- **Shopify.** Selector "Previous period" / "Previous year" / rango custom.
- **Tiendanube.** "Comparar resultados con otro período de la misma duración".
- **Stripe.** Muestra el valor del período previo debajo del actual, en
  tipografía más chica, sin repetir un rótulo por métrica.
- **Polaris (Shopify).** Documenta un badge de tendencia con flecha y
  porcentaje, sin prescribir texto para el período.
  https://shopify.dev/docs/api/app-home/patterns/compositions/metrics-card
- **Nielsen Norman.** La comparación contra el período previo es esencial, pero
  las guías no prescriben cómo rotularla.

**Lo que hacemos acá, y por qué.** El período se nombra **una sola vez**, arriba
del bloque, con las fechas reales que ya manda el backend en `ranges.previous`
("Comparado con 10 al 16 ago"). Debajo de cada métrica queda el delta y el valor
contra el que se compara, sin la palabra "antes" (`+16.5% vs $56K`). El titular
también dice sus fechas ("ROAS real · 17 al 23 ago") en vez de repetir el chip
de período que ya está seleccionado arriba.

## Texto de apoyo debajo de una métrica

Teníamos un párrafo bajo el ROAS que decía "Por cada peso en Meta entraron 5.98
pesos cobrados en Tiendanube...". Repetía el número que ya se lee gigante.

**Qué está documentado.** El texto junto a un KPI se justifica cuando aporta
**causa o acción** (Sisense; Stephen Few, *Sticky Stories Told with Numbers*).
No cuando reformula el número.

**Lo que hacemos acá.** Con datos, el número va solo y la definición vive en el
tooltip del rótulo. El párrafo queda reservado para explicar por qué **no** hay
número.

## Cuántas métricas arriba

5 a 7 en una vista de resumen, 9 como máximo en operacionales (Material Design,
UXPin). Tenemos 1 principal + 4 comparadas. Dentro del rango.

## Overview separado del detalle

IBM Carbon distingue *presentation dashboards* (estado actual, para orientar) de
*exploration dashboards* (filtros y drill-down para expertos). Nuestra pestaña
Resumen es el primer tipo; Meta Ads y Tienda son el segundo. La separación está
bien planteada.

## Dos series con escalas muy distintas — PENDIENTE

El gráfico "Ventas por día" superpone la línea de gasto ($185K) sobre las barras
de ingresos ($1.1M). **Esto está desaconsejado explícitamente**: los gráficos de
doble eje sugieren correlaciones que no existen (Microsoft Power BI, Inforiver).

Las alternativas documentadas son dos: gráficos separados apilados
verticalmente, o normalizar ambas series a porcentaje. Nuestro tooltip ya
calcula "qué porcentaje de lo que entró ese día se lo llevó la publicidad", que
es justamente la normalización — pero está escondido en el hover.

Sin decidir.

## Margen / COGS en el titular — dato para el debate

Se decidió que el titular es siempre el ROAS. Para que quede registrado qué
hacen los demás: **Triple Whale y Polar Analytics sí ponen el margen arriba**
(MER y CM1–CM4 como KPI principal, con el COGS cargado en Settings), mientras
**Northbeam lo trata como métrica secundaria** y Shopify no lo integra nativo.
O sea, las dos posturas existen en productos reales.
