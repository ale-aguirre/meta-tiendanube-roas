/* summary — la pestaña Resumen
 *
 * El ROAS real, la comparación contra el período anterior y las reglas deterministas de "Qué mirar".
 *
 * Scripts clásicos, sin bundler: se cargan en orden desde index.html y
 * comparten el mismo scope global. Cada nombre se declara una sola vez.
 */

// Pestaña Resumen.
//
// Las reglas de "Qué mirar" son deterministas: sin LLM, sin latencia, sin API
// key, misma entrada igual salida. El análisis escrito con IA es otra cosa,
// vive en la pestaña Meta Ads y es opcional.

const PERIODO_TXT = {
  today: 'hoy', yesterday: 'ayer', last_7d: 'los últimos 7 días',
  last_14d: 'los últimos 14 días', last_30d: 'los últimos 30 días',
  last_90d: 'los últimos 90 días', this_month: 'este mes',
  last_month: 'el mes pasado', this_year: 'este año',
};

/**
 * Grafico de barras de ingresos diarios con tooltips.
 *
 * `rango` es el periodo cerrado del resumen. Sin el, el grafico dibujaba un dia
 * mas que las metricas de arriba (el resumen cierra ayer, revenueByDay incluye
 * hoy), asi que la suma de las barras no daba "entro a caja" y las dos cosas
 * estaban en la misma pantalla.
 */
function pintarGraficos(tn, metaDaily, rango) {
  let dias = (tn && tn.revenueByDay) || [];
  if (rango && rango.start && rango.end) {
    dias = dias.filter(d => d.date >= rango.start && d.date <= rango.end);
  }
  const top  = (tn && tn.topProducts) || [];
  const barsEl = $('homeBars');
  if (!barsEl) return;

  if (!dias.length && !top.length) { $('homeCharts').classList.add('hidden'); return; }

  // --- Barras de ingresos diarios ---
  if (dias.length > 1) {
    const maxRev = Math.max(...dias.map(d => d.revenue)) || 1;
    const metaMap = {};
    if (metaDaily && metaDaily.length) {
      metaDaily.forEach(d => { metaMap[d.date_start] = parseFloat(d.spend) || 0; });
    }

    const fmtDate = s => { const parts = s.split('-'); return parts[2] + '/' + parts[1]; };
    const barMaxH = 140;

    barsEl.innerHTML = '<div class="flex items-end gap-1 sm:gap-1.5" style="height:' + (barMaxH + 32) + 'px">' +
      dias.map((d, i) => {
        const h = Math.round((d.revenue / maxRev) * barMaxH);
        const metaSpend = metaMap[d.date] || 0;
        // El gasto es ~6 veces menor que el ingreso, asi que dibujado a la
        // misma escala quedaba una astilla de 3px que no se veia. Va como una
        // marca sobre la barra, que es lo que se necesita mirar: cuanto de lo
        // que entro ese dia se lo comio la publicidad.
        const metaH = maxRev > 0 ? Math.round((metaSpend / maxRev) * barMaxH) : 0;
        const pct = d.revenue > 0 ? Math.round(metaSpend / d.revenue * 100) : 0;
        return '<div class="flex-1 flex flex-col items-center gap-1 group cursor-default relative" style="min-width:0">' +
          '<div class="relative w-full flex flex-col justify-end" style="height:' + barMaxH + 'px">' +
          '<div class="w-full rounded-t-sm bg-blue-500 relative" style="height:0;transition:height .8s var(--ease) ' + (0.02 * i).toFixed(2) + 's" data-h="' + h + '">' +
          (metaSpend > 0 ? '<div class="absolute left-0 right-0 border-t-2 border-dashed border-amber-500" style="bottom:' + metaH + 'px" title="Gasto Meta: ' + fmtARS(metaSpend) + '"></div>' +
            '<div class="absolute left-0 right-0 bottom-0 bg-amber-400/25" style="height:' + metaH + 'px"></div>' : '') +
          '</div>' +
          '</div>' +
          '<span class="text-[10px] text-slate-400 font-medium leading-none mt-1.5">' + fmtDate(d.date) + '</span>' +
          '<div class="hidden group-hover:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-lg z-20 pointer-events-none whitespace-nowrap flex-col items-center">' +
          '<span>' + fmtARS(d.revenue) + '</span>' +
          (metaSpend > 0 ? '<span class="text-amber-300 text-[10px] mt-0.5">Gasto ' + fmtARS(metaSpend) + ' · ' + pct + '% de lo que entró</span>' : '') +
          '</div>' +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="flex items-center gap-3 mt-3 text-xs text-slate-400">' +
      '<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm bg-blue-500"></span> Ingresos</span>' +
      (Object.keys(metaMap).length > 0 ? '<span class="flex items-center gap-1.5"><span class="w-3 h-0 border-t-2 border-dashed border-amber-500"></span> Gasto en ads</span>' : '') +
      '<span class="ml-auto font-medium text-slate-500">' + fmtDate(dias[0].date) + ' – ' + fmtDate(dias[dias.length - 1].date) + '</span>' +
      '</div>';

    // Trigger bar animations after render
    requestAnimationFrame(() => {
      barsEl.querySelectorAll('[data-h]').forEach(bar => {
        bar.style.height = bar.dataset.h + 'px';
      });
    });
  } else if (dias.length === 1) {
    barsEl.innerHTML = '<div class="flex items-center justify-center py-10 text-slate-400"><p>Un solo día con ventas: <span class="font-bold text-slate-700">' + fmtARS(dias[0].revenue) + '</span> el ' + dias[0].date.split('-').reverse().join('/') + '</p></div>';
  } else {
    barsEl.innerHTML = '<p class="text-slate-400 text-center py-10">Sin datos de ingresos diarios en este período</p>';
  }

  // --- Top productos ---
  const maxQty = Math.max(...top.map(p => p.qty || 0), 1);
  $('homeTop').innerHTML = top.slice(0, 4).map((p, i) => '<div class="fade-up" style="animation-delay:' + (.1 + i * .07) + 's"><div class="flex items-baseline justify-between gap-3"><span class="text-sm font-semibold text-slate-700 truncate">' + p.name + '</span><span class="text-sm font-bold text-slate-900 tabular-nums shrink-0">' + p.qty + '</span></div><div class="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden"><div class="h-full bg-blue-500 rounded-full" style="width:0;animation:crecer 1s cubic-bezier(.34,1.2,.64,1) ' + (.15 + i * .07) + 's forwards;--w:' + (p.qty / maxQty * 100).toFixed(0) + '%"></div></div></div>').join('') || '<p class="text-sm text-slate-400 mt-2">Sin ventas en el período</p>';

  $('homeCharts').classList.remove('hidden');
}
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "10 - 16 ago" o "28 jul - 3 ago". El server ya manda las fechas del periodo
 * previo en ranges.previous; sin decirlas, un "-33% (antes $79K)" no dice
 * antes de que.
 */
function fmtRangoFechas(startISO, endISO) {
  if (!startISO || !endISO) return '';
  const [ys, ms, ds] = startISO.split('-').map(Number);
  const [ye, me, de] = endISO.split('-').map(Number);
  if (!ys || !ye) return '';
  const mismoMes = ms === me && ys === ye;
  return mismoMes
    ? `${ds} al ${de} ${MESES_CORTOS[me - 1]}`
    : `${ds} ${MESES_CORTOS[ms - 1]} al ${de} ${MESES_CORTOS[me - 1]}`;
}

function comparisonText(current, previous, formatter) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 'sin período previo';
  const change = ((current - previous) / previous) * 100;
  const signo = change >= 0 ? '+' : '';
  // El formatter venia sin usar: mostrar solo el porcentaje obliga a hacer la
  // cuenta mental para saber contra que numero se compara.
  // "antes X" no dice antes de que. El periodo se nombra una vez arriba, con
  // fechas, y aca queda el valor contra el que se compara.
  const antes = typeof formatter === 'function' ? ` vs ${formatter(previous)}` : '';
  return `${signo}${change.toFixed(1)}%${antes}`;
}

// ─── Margen ───────────────────────────────────────────────────────────────
// Que porcentaje de cada venta le queda a la duena despues del costo del
// producto. Es el dato que convierte "ROAS 6x" en "ganaste tanto". Vive en el
// navegador: es de ella, no del servidor, y no hay razon para mandarlo.
const MARGEN_KEY = 'dashboard_margen_pct';

function leerMargen() {
  try {
    const v = parseInt(localStorage.getItem(MARGEN_KEY), 10);
    return Number.isFinite(v) && v > 0 && v < 100 ? v : null;
  } catch { return null; }
}

function guardarMargen(v) {
  try {
    if (Number.isFinite(v) && v > 0 && v < 100) localStorage.setItem(MARGEN_KEY, String(v));
    else localStorage.removeItem(MARGEN_KEY);
  } catch { /* modo incognito, se sigue sin margen */ }
}

function initMargen() {
  const input = $('margenInput');
  if (!input) return;
  const actual = leerMargen();
  input.value = actual !== null ? actual : '';
  input.placeholder = '50';
  avisoMargen(actual);
  pintarMargenHint();
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    // Se espera a que termine de tipear: sin esto, escribir "50" recalcula
    // primero con 5 y el numero grande pega un salto raro.
    t = setTimeout(() => {
      const v = parseInt(input.value, 10);
      guardarMargen(v);
      avisoMargen(leerMargen());
      pintarMargenHint();
      if (typeof loadData === 'function') loadData();
    }, 600);
  });
}

// Ultimo ROAS pintado. El punto de equilibrio se recalcula al tipear el margen
// sin esperar a que vuelva el fetch.
let ultimoRoas = null;

/**
 * El punto de equilibrio (100 / margen) es el unico umbral que ni Meta ni
 * la tienda conocen, asi que se muestra SIEMPRE que haya margen cargado, no
 * solo cuando el ROAS esta cerca del limite. Cuando ademas hay riesgo, la
 * regla 6 lo repite arriba como alerta.
 */
function pintarMargenHint() {
  const el = $('margenHint');
  if (!el) return;
  const m = leerMargen();
  if (m === null) {
    el.textContent = 'Opcional. Con ese dato se calcula el ROAS mínimo que necesitás para no perder plata.';
    el.className = 'text-xs text-slate-400 mt-2';
    return;
  }
  const minimo = 100 / m;
  if (ultimoRoas === null) {
    el.textContent = `Con ${m}% de margen tu punto de equilibrio es ${minimo.toFixed(1)}x.`;
  } else {
    el.textContent = `Con ${m}% de margen tu punto de equilibrio es ${minimo.toFixed(1)}x. `
      + `Estás en ${ultimoRoas.toFixed(2)}x.`;
  }
  el.className = 'text-xs text-slate-500 mt-2 tabular-nums';
}

/**
 * Un margen absurdo produce un numero grande absurdo, y el numero grande no
 * tiene forma de verse mal. Mejor decirlo que dejarlo pasar.
 */
function avisoMargen(v) {
  const el = $('margenAviso');
  if (!el) return;
  let msg = '';
  if (v === null) msg = '';
  else if (v <= 10) msg = `¿Seguro que te quedan solo $${v} de cada $100? Con ese margen casi ningún negocio cubre la publicidad.`;
  else if (v >= 90) msg = `¿Seguro que te quedan $${v} de cada $100? Acordate de descontar el producto, el envío y las comisiones de cobro.`;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

/**
 * Reglas deterministas sobre los datos del periodo. Cada una devuelve el
 * hallazgo y que hacer al respecto. Sin LLM: corren en cero milisegundos, no
 * necesitan API key, y dan siempre la misma respuesta ante los mismos numeros,
 * que es lo que uno espera de un tablero.
 */
function evaluarReglas(meta, tn, roas, comparison, campaignRows) {
  const r = [];
  const ticket = tn && tn.orders > 0 ? (tn.avgTicket || tn.revenue / tn.orders) : null;

  // 1. Campanas donde traer una venta cuesta mas de lo que deja esa venta.
  (campaignRows || []).forEach(row => {
    const gasto = parseFloat(row.spend) || 0;
    if (gasto <= 0) return;
    const compras = getAction(row.actions, ['omni_purchase', 'purchase']);
    if (compras === 0) {
      if (gasto > (meta?.spend || 0) * 0.15) {
        r.push({ n: 'alto', q: `"${row.campaign_name}" gastó ${fmtARS(gasto)} y no registró ninguna compra.`,
                 a: 'Revisala antes de que siga corriendo. Puede ser el público, la creatividad o que el píxel no esté midiendo.' });
      }
      return;
    }
    const costo = gasto / compras;
    if (ticket && costo > ticket) {
      r.push({ n: 'alto', q: `"${row.campaign_name}" te cuesta ${fmtARS(costo)} por venta y tu ticket promedio es ${fmtARS(ticket)}.`,
               a: 'Cada venta de esa campaña te deja menos de lo que sale conseguirla. Pausala o bajale el presupuesto.' });
    }
  });

  // 2. Meta dice mas compras de las que se cobraron.
  if (meta && tn && meta.purchases > 0 && tn.orders > 0) {
    const dif = meta.purchases - tn.orders;
    if (dif > Math.max(3, tn.orders * 0.3)) {
      r.push({ n: 'medio', q: `Meta reporta ${fmt(meta.purchases)} compras y en la tienda se cobraron ${fmt(tn.orders)}.`,
               a: 'Meta se atribuye ventas que hubieran pasado igual. Para decidir presupuesto, guiate por las cobradas.' });
    }
  }

  // 3. Gasto que sube mientras los ingresos bajan.
  if (comparison?.comparable) {
    const gastoSube = comparison.current.meta.spend > comparison.previous.meta.spend * 1.05;
    const ventaBaja = comparison.current.tn.revenue < comparison.previous.tn.revenue * 0.95;
    if (gastoSube && ventaBaja) {
      r.push({ n: 'alto', q: 'Subiste el gasto en publicidad y bajaron los ingresos respecto del período anterior.',
               a: 'Volvé al presupuesto anterior y fijate qué campaña cambió en el medio.' });
    }
  }

  // 4. El CTR.
  if (meta && meta.ctr > 0 && meta.ctr < 1) {
    r.push({ n: 'medio', q: `El CTR está en ${meta.ctr.toFixed(2)}%. De cada 100 personas que ven el anuncio, menos de una entra.`,
             a: 'Suele ser la imagen antes que el texto. Probá una creatividad distinta con el mismo público.' });
  }

  // 5. Gasto sin ninguna venta en todo el periodo.
  if (tn && tn.orders === 0 && meta && meta.spend > 0) {
    r.push({ n: 'alto', q: `Gastaste ${fmtARS(meta.spend)} y no se cobró ninguna orden en el período.`,
             a: 'Antes de tocar los anuncios, probá comprar en la tienda vos misma. Suele ser el checkout, no el ads.' });
  }

  // 6. Con el margen cargado se puede decir el umbral real, que es el dato que
  //    ninguna de las dos plataformas conoce.
  const margenPct = leerMargen();
  if (margenPct !== null && roas !== null) {
    const roasMinimo = 100 / margenPct;
    if (roas < roasMinimo) {
      r.push({ n: 'alto', q: `Con ${margenPct}% de margen necesitás un ROAS de ${roasMinimo.toFixed(1)}x para no perder, y estás en ${roas.toFixed(2)}x.`,
               a: 'Cada peso que ponés en publicidad vuelve con menos. Bajá presupuesto hasta encontrar el punto donde da.' });
    } else if (roas < roasMinimo * 1.5) {
      r.push({ n: 'medio', q: `Tu punto de equilibrio con ${margenPct}% de margen es ${roasMinimo.toFixed(1)}x y estás en ${roas.toFixed(2)}x.`,
               a: 'Ganás, pero el colchón es fino. Si el ROAS baja un poco más, empezás a perder.' });
    }
  }

  if (!r.length) {
    r.push({ n: 'ok', q: 'Ninguna campaña gasta más de lo que deja, y las dos fuentes de datos coinciden.',
             a: roas && roas >= 3
               ? `Con ${roas.toFixed(1)}x de ROAS hay margen para subir presupuesto en la que mejor rinde. Subí de a poco: el ROAS suele bajar al escalar.`
               : 'No hay nada urgente para tocar esta semana.' });
  }

  const orden = { alto: 0, medio: 1, ok: 2 };
  return r.sort((a, b) => orden[a.n] - orden[b.n]).slice(0, 4);
}

function pintarReglas(meta, tn, roas, comparison, campaignRows) {
  const reglas = evaluarReglas(meta, tn, roas, comparison, campaignRows);
  const punto = { alto: 'bg-red-500', medio: 'bg-amber-400', ok: 'bg-emerald-500' };
  const texto = { alto: 'Urgente', medio: 'Para mirar', ok: 'Sin alertas' };
  $('homeRulesList').innerHTML = reglas.map((x, i) => `
    <div class="flex gap-4 py-4 first:pt-0 last:pb-0 fade-up" style="animation-delay:${(i * .05).toFixed(2)}s">
      <span class="w-2 h-2 rounded-full ${punto[x.n]} shrink-0 mt-2" aria-hidden="true"></span>
      <div class="min-w-0">
        <p class="text-[11px] uppercase tracking-wider font-bold text-slate-400">${texto[x.n]}</p>
        <p class="text-base font-semibold text-slate-900 mt-1">${x.q}</p>
        <p class="text-sm text-slate-500 mt-1.5">${x.a}</p>
      </div>
    </div>`).join('');
  $('homeRules').classList.remove('hidden');
}

function pintarResumenV2(meta, tn, comparison, campaignRows, metaDaily) {
  $('homeLoading').classList.add('hidden');
  // When comparable, use the endpoint's identical closed ranges for every summary metric.
  const summaryMeta = comparison?.comparable ? comparison.current.meta : meta;
  const summaryTN = comparison?.comparable ? comparison.current.tn : tn;
  const hasMeta = summaryMeta && Number.isFinite(summaryMeta.spend);
  const hasTN = summaryTN && Number.isFinite(summaryTN.revenue);
  const roas = hasMeta && hasTN && summaryMeta.spend > 0 ? summaryTN.revenue / summaryMeta.spend : null;
  const periodo = PERIODO_TXT[currentDatePreset] || 'el período seleccionado';
  // El titular es siempre el ROAS real. Es lo que el dashboard promete y no
  // cambia segun un dato opcional: el margen solo alimenta el punto de
  // equilibrio dentro de "Que mirar".
  $('homeHeroLabel').textContent = 'ROAS real';
  $('homeHeadline').textContent = roas === null ? '—' : `${roas.toFixed(2)}x`;
  // Con datos, el numero grande habla solo: cualquier frase abajo repite lo que
  // ya se lee. El parrafo queda para decir por que NO hay numero.
  $('homeSub').textContent = roas === null
    ? 'Falta el gasto de Meta o los ingresos de la tienda para este período. Revisá que los dos tokens estén configurados.'
    : '';
  $('homeSub').classList.toggle('hidden', roas !== null);
  ultimoRoas = roas;
  pintarMargenHint();
  const rangoActual = comparison?.comparable
    ? fmtRangoFechas(comparison.ranges?.current?.start, comparison.ranges?.current?.end) : '';
  $('homePeriod').textContent = rangoActual || periodo;
  const rangoPrevio = comparison?.comparable
    ? fmtRangoFechas(comparison.ranges?.previous?.start, comparison.ranges?.previous?.end) : '';
  $('homeCompareLabel').textContent = rangoPrevio
    ? `Comparado con ${rangoPrevio}` : 'Comparado con el período anterior';
  // Al lado del valor va la variacion, no una etiqueta de animo.
  const roasPrev = comparison?.comparable && comparison.previous.meta.spend > 0
    ? comparison.previous.tn.revenue / comparison.previous.meta.spend : null;
  if (roas !== null && roasPrev) {
    const d = ((roas - roasPrev) / roasPrev) * 100;
    $('homeStatusBadge').className = `text-base font-semibold tabular-nums ${d >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
    $('homeStatusBadge').textContent = `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%`;
  } else {
    $('homeStatusBadge').className = 'text-base font-semibold text-slate-400';
    $('homeStatusBadge').textContent = '';
  }
  const ticketActual = summaryTN && summaryTN.orders > 0
    ? (summaryTN.avgTicket || summaryTN.revenue / summaryTN.orders) : null;
  $('homeTicketValue').textContent = ticketActual ? fmtARS(ticketActual) : '—';
  $('homeMoneyIn').textContent = hasTN ? fmtARS(summaryTN.revenue) : 'Sin datos';
  $('homeMoneyOut').textContent = hasMeta ? fmtARS(summaryMeta.spend) : 'Sin datos';
  $('homeOrders').textContent = summaryTN && Number.isFinite(summaryTN.orders) ? fmt(summaryTN.orders) : 'Sin datos';

  // Cada línea de apoyo dice contra qué compara. Antes las cuatro decían
  // "vs. período anterior" con números distintos y parecían contradecirse; el
  // período se nombra una sola vez, en homeCompareLabel.
  let rangeLabel = '';
  if (comparison?.comparable) {
    rangeLabel = comparisonText(comparison.current.meta.spend, comparison.previous.meta.spend, value => fmtARS(value));
    $('homeDelta').textContent = comparisonText(comparison.current.tn.revenue, comparison.previous.tn.revenue, value => fmtARS(value));
    $('homeMetaPurchases').textContent = comparisonText(comparison.current.tn.orders, comparison.previous.tn.orders, value => fmt(value));
  } else {
    $('homeDelta').textContent = '';
    $('homeMetaPurchases').textContent = '';
  }
  const ticketDe = t => (t && t.orders > 0) ? t.revenue / t.orders : null;
  $('homeTicketComparison').textContent = comparison?.comparable
    ? comparisonText(ticketDe(comparison.current.tn), ticketDe(comparison.previous.tn), v => fmtARS(v))
    : '';
  $('homeComparisonRange').textContent = rangeLabel;
  $('homeVerdict').classList.remove('hidden');

  pintarReglas(summaryMeta, summaryTN, roas, comparison, campaignRows);

  // Antes esto dibujaba UNA sola campana dentro de una grilla de tres, asi que
  // quedaban dos tercios vacios al lado. Van las tres que mas gastan, que es
  // ademas lo que hay que mirar para decidir cual pausar.
  const usableRows = (campaignRows || [])
    .filter(row => Number.isFinite(parseFloat(row.spend)) && parseFloat(row.spend) > 0)
    .sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend))
    .slice(0, 3);

  $('homeActions').innerHTML = usableRows.map((row, i) => {
    const gasto = parseFloat(row.spend);
    const compras = getAction(row.actions, ['omni_purchase', 'purchase']);
    // Lo que cuesta traer una venta: el unico numero por campana que sirve
    // para decidir sin abrir Meta.
    const costo = compras > 0 ? gasto / compras : null;
    const alerta = costo !== null && summaryTN?.avgTicket > 0 && costo > summaryTN.avgTicket;
    return `<article class="rounded-xl bg-white border ${alerta ? 'border-amber-300' : 'border-slate-200'} shadow-sm p-5 fade-up" style="animation-delay:${(i * .06).toFixed(2)}s">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">${i === 0 ? 'La que más gasta' : 'Campaña ' + (i + 1)}</p>
      <p class="text-base font-bold text-slate-900 truncate" title="${row.campaign_name || ''}">${row.campaign_name || 'Campaña sin nombre'}</p>
      <p class="text-3xl font-bold text-slate-950 mt-3 tabular-nums">${costo === null ? '—' : fmtARS(costo)}</p>
      <p class="text-sm text-slate-400 mt-1">${costo === null ? 'sin compras registradas' : 'te cuesta cada venta'}</p>
      <p class="text-sm ${alerta ? 'text-amber-700 font-semibold' : 'text-slate-400'} mt-3 pt-3 border-t border-slate-100">
        ${alerta ? 'Cuesta más que tu ticket promedio' : `${fmtARS(gasto)} gastados · ${fmt(compras)} compras`}
      </p>
    </article>`;
  }).join('');
  $('homeActions').classList.toggle('hidden', !usableRows.length);
  pintarGraficos(tn, metaDaily, comparison?.comparable ? comparison.ranges?.current : null);
  switchHomeInsight('sales');
  $('homeGoNumbers').classList.remove('hidden');
}

function resumenEnError(msg) {
  $('homeLoading').classList.add('hidden');
  $('homeVerdict').classList.add('hidden');
  $('homeActions').classList.add('hidden');
  $('homeRules')?.classList.add('hidden');
  $('homeCharts').classList.add('hidden');
  $('homeErrorWhat').textContent = msg;
  $('homeErrorFix').textContent = /token|OAuth|expired|session/i.test(msg)
    ? 'Parece que se venció el acceso a Meta. Hay que renovar el token, está explicado en docs/setup.md.'
    : 'Probá el botón de actualizar. Si sigue igual, el detalle está en la consola del servidor.';
  $('homeError').classList.remove('hidden');
}

function resumenCargando(paso) {
  $('homeError').classList.add('hidden');
  $('homeLoading').classList.remove('hidden');
  $('homeVerdict').classList.add('hidden');
  $('homeActions').classList.add('hidden');
  $('homeRules')?.classList.add('hidden');
  $('homeCharts').classList.add('hidden');
  $('homeGoNumbers').classList.add('hidden');
  if (paso) $('homeLoadingStep').textContent = paso;
}
