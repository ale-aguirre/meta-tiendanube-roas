# Reglas de diseño

Esto no es una guía de estilo genérica. Es lo que ya está aplicado en el
dashboard y lo que hay que respetar para no romperlo.

## Para quién es

Una persona que vende online y no es técnica. Entra, quiere saber si la
publicidad le está dejando plata, y salir. No es un analista y no va a leer.

De ahí salen las tres reglas duras:

1. **El dashboard no opina, informa.** Nada de "te está yendo bien" ni "en
   verde". Métrica, valor, variación, definición. El juicio lo pone quien lo
   lee. Lo único que sí interpreta es el bloque *Qué mirar*, y ahí cada línea
   dice el hallazgo y qué hacer, no un adjetivo.
2. **Cada dato aparece una sola vez.** Si el ROAS está en el titular, no va
   también en una tarjeta al costado.
3. **Nada de color solo.** Toda señal por color lleva además una palabra. Un
   8% de los varones no distingue verde de rojo.

## Color

Los tokens viven en `:root`, en `src/public/index.html`.

| Token | Valor | Para qué |
|---|---|---|
| `--blue` | `#1877F2` | Acento principal, barras de ingresos, elementos activos |
| `--green` | `#059669` | Solo variación positiva |
| `--red` | `#DC2626` | Solo variación negativa y alertas urgentes |
| `--amber` | `#D97706` | Solo "para mirar". Y la línea de gasto en el gráfico |
| `--indigo` `--purple` | | Heredados. **No usar en pantallas nuevas** |

**Fondo** `#F8FAFC`, **texto** `#0F172A`. Escala de grises: `slate` de Tailwind.

Regla: **verde, rojo y ámbar solo comunican estado.** Si aparecen como
decoración, dejan de significar algo. Todo lo demás es azul o gris.

## Tipografía

Inter, un solo peso familiar. No hay segunda fuente y no hace falta.

| Uso | Clase | Nota |
|---|---|---|
| Métrica principal | `text-6xl sm:text-7xl font-bold tabular-nums` | Una por pantalla |
| Métrica de tira | `text-4xl font-bold tabular-nums` | |
| Rótulo de métrica | `text-xs uppercase tracking-widest font-semibold text-slate-400` | |
| Rótulo de sección | `text-[11px] uppercase tracking-[0.18em] text-slate-400` | |
| Cuerpo | `text-base text-slate-900` | |
| Apoyo | `text-sm text-slate-500` | |

**Todo número lleva `tabular-nums`.** Sin eso los dígitos cambian de ancho
mientras se animan y el ojo lee ruido en vez de un número.

## Espaciado

Escala en `:root`: `--s-1` a `--s-16`, de 4px a 64px. Nada de valores sueltos
elegidos a ojo.

Ritmo dentro de una tarjeta: padding `p-6 sm:p-8`, separación entre bloques
`mt-9 pt-8 border-t`, entre tarjetas `gap-4`.

## Movimiento

Una sola curva, `--ease: cubic-bezier(.34, 1.3, .64, 1)`, y una duración base
`--dur: .35s`. Las barras del gráfico van más lento a propósito, 0.8s, porque
crecen desde cero.

`prefers-reduced-motion: reduce` apaga todo. No es opcional: hay gente que se
marea y el sistema operativo ya lo declara.

## Gráficos

- **Ingresos**: barras azules llenas.
- **Gasto**: línea punteada ámbar sobre la barra, más un relleno tenue debajo.
  Como barra propia no servía: el gasto es ~6 veces menor que el ingreso y a la
  misma escala quedaba una astilla de 3px invisible.
- El tooltip dice **qué porcentaje de lo que entró ese día se lo llevó la
  publicidad**, que es la lectura que importa.

## Estados

Los tres existen y se ven: **cargando** con el paso actual escrito, **error**
con qué pasó y qué hacer, y **sin datos** con el motivo. Un dashboard que se
queda en blanco cuando falla algo es peor que uno que no existe.

## Lo que falta y se sabe

- **No muestra ganancia, y es a propósito.** El titular es siempre el ROAS. El
  margen es un dato opcional al pie de *Qué mirar* y solo habilita el punto de
  equilibrio. Un dashboard de ROAS que se convierte en calculadora de ganancia
  según un campo que el usuario puede o no cargar deja de prometer una cosa
  sola.
- **La comparación es de un período contra el anterior.** Eso es una foto, no
  una tendencia.
- **El gráfico diario no responde qué día conviene gastar más**, que sería
  ROAS por día en vez de ingresos por día.
