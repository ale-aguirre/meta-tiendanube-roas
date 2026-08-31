/* store — ventas y la pestaña Tienda
 *
 * Lo cobrado en la tienda: KPIs del período y el análisis del histórico completo.
 *
 * Scripts clásicos, sin bundler: se cargan en orden desde index.html y
 * comparten el mismo scope global. Cada nombre se declara una sola vez.
 */

/* ── Ventas del período (pestaña Meta Ads) ───────────────────────────── */
function renderTNStats(tn) {
  lastTNData = tn;
  $('tnRevenue').textContent = fmtARS(tn.revenue);
  $('tnOrders').textContent = fmt(tn.orders);
  $('tnTicket').textContent = tn.avgTicket > 0 ? fmtARS(tn.avgTicket) : '—';

  const roasEl = $('tnRoas');
  const roasCard = $('tnRoasCard');
  if (lastMetaData && lastMetaData.spend > 0 && tn.revenue > 0) {
    const roas = tn.revenue / lastMetaData.spend;
    roasEl.textContent = fmt(roas, 2) + 'x';
    if (roas >= 3) { roasCard.classList.add('card-green'); roasEl.className = 'kpi-number text-emerald-800 mt-2'; }
    else if (roas >= 1.5) { roasCard.classList.add('card-indigo'); roasEl.className = 'kpi-number text-indigo-800 mt-2'; }
    else { roasCard.classList.add('card-red'); roasEl.className = 'kpi-number text-red-700 mt-2'; }
  } else {
    roasEl.textContent = '—';
  }

  // Top products
  const topEl = $('tnTopProducts');
  if (!tn.topProducts || !tn.topProducts.length) {
    topEl.innerHTML = '<p class="text-slate-300 text-sm text-center py-4">Sin ventas en el periodo</p>';
  } else {
    const maxRev = tn.topProducts[0].revenue;
    topEl.innerHTML = tn.topProducts.map((p, i) => {
      const w = maxRev > 0 ? Math.round((p.revenue / maxRev) * 100) : 0;
      return `<div class="flex items-center gap-3">
        <span class="text-xs font-bold text-slate-400 w-4 shrink-0">${i+1}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-semibold text-slate-700 truncate">${p.name}</p>
            <p class="text-xs font-bold text-emerald-700 shrink-0 ml-2">${p.qty} ud</p>
          </div>
          <div class="bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div class="h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 bar" style="width:${w}%"></div>
          </div>
        </div>
        <span class="text-xs font-bold text-slate-600 shrink-0 tabular-nums w-20 text-right">${fmtARS(p.revenue)}</span>
      </div>`;
    }).join('');
  }

  // Abandoned carts
  const abEl = $('tnAbandoned');
  const badge = $('tnAbandonedBadge');
  badge.textContent = tn.abandonedCount ? `${tn.abandonedCount} carritos` : '0';
  if (tn.abandonedCount > 0) badge.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700';
  else badge.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-400';

  const totalEl = $('tnAbandonedTotal');
  if (tn.abandonedTotal > 0) {
    totalEl.textContent = `🔴 ${fmtARS(tn.abandonedTotal)} perdidos`;
    totalEl.classList.remove('hidden');
  }

  if (!tn.abandoned || !tn.abandoned.length) {
    abEl.innerHTML = '<p class="text-slate-300 text-sm text-center py-4">Sin carritos pendientes</p>';
  } else {
    abEl.innerHTML = tn.abandoned.map(o => {
      const d = new Date(o.created_at);
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const dateStr = `${d.getDate()} ${meses[d.getMonth()]}`;
      const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
      const ago = diffDays === 0 ? 'hoy' : diffDays === 1 ? 'ayer' : `hace ${diffDays}d`;
      return `<div class="p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-semibold text-slate-700 truncate">${o.name}</p>
          <span class="text-xs font-bold text-amber-700 shrink-0 tabular-nums">${fmtARS(o.total)}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-1">
          <p class="text-xs text-slate-400 truncate">${o.products || '—'}</p>
          <span class="text-xs text-slate-400 shrink-0">${dateStr} · ${ago}</span>
        </div>
      </div>`;
    }).join('');
  }
}

let tnaLoaded = false;
let generoChartInst = null, pagosChartInst = null, mesChartInst = null, diasChartInst = null;

function fmtMes(key) {
  const [y, m] = key.split('-');
  const names = ['', 'Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return names[parseInt(m)] + ' ' + y.slice(2);
}

async function loadTiendaAnalytics() {
  try {
    const r = await fetch('/api/store/analytics');
    const d = await r.json().catch(() => ({}));
    // El backend responde 503 con el motivo y la variable que falta. Cortar en
    // !r.ok tiraba ese mensaje y dejaba 'HTTP 503', que no le sirve a nadie.
    if (d.error) throw new Error(d.error);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    renderTiendaAnalytics(d);
    tnaLoaded = true;
  } catch (e) {
    $('tnaLastUpdate').textContent = 'Error cargando datos: ' + e.message;
    $('tnaLastUpdate').classList.add('text-red-400');
  }
}

let horasChartInst = null, rangosChartInst = null;

function renderTiendaAnalytics(d) {
  // KPIs principales
  $('tnaTotalOrders').textContent = fmt(d.total_orders);
  $('tnaTotalRevenue').textContent = fmtARS(d.total_revenue);
  $('tnaTicket').textContent = fmtARS(d.ticket_promedio);

  if (d.meses && d.meses.length) {
    const best = d.meses.reduce((a, b) => b.revenue > a.revenue ? b : a);
    $('tnaBestMonth').textContent = fmtMes(best.mes);
    $('tnaBestMonthRev').textContent = fmtARS(best.revenue);
  }

  // Provincias
  const provData = Array.isArray(d.provincias[0]) ? d.provincias : d.provincias.map(p => [p.prov, p.count]);
  renderProvBar('tnaProvincias', provData, d.total_orders);

  // Genero — heuristica opcional del backend (FEATURE_INFER_GENDER).
  // Si viene apagada, d.genero es null y la tarjeta directamente no se dibuja.
  const g = d.genero;
  const generoCard = $('generoChart')?.closest('.tn-card');
  if (generoCard) generoCard.classList.toggle('hidden', !g);
  if (generoChartInst) generoChartInst.destroy();
  if (g) {
    generoChartInst = new Chart($('generoChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Mujeres', 'Hombres', 'Sin datos'], datasets: [{ data: [g.mujeres, g.hombres, g.sinDato], backgroundColor: ['#F472B6','#60A5FA','#CBD5E1'], borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#F8FAFC', padding: 10, cornerRadius: 10, callbacks: { label: ctx => '  ' + ctx.label + ': ' + ctx.raw + ' (' + Math.round(ctx.raw/(g.mujeres+g.hombres+g.sinDato)*100) + '%)' } } } }
    });
  }

  // Pagos
  if (pagosChartInst) pagosChartInst.destroy();
  pagosChartInst = new Chart($('pagosChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: d.pagos.map(p => p.metodo), datasets: [{ data: d.pagos.map(p => p.count), backgroundColor: ['#34D399','#60A5FA','#A78BFA','#F472B6','#FBBF24','#6EE7B7','#93C5FD','#C4B5FD'], borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, usePointStyle: true, pointStyleWidth: 7, boxHeight: 7 } }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#F8FAFC', padding: 10, cornerRadius: 10 } } }
  });

  // Top por unidades y revenue
  renderProdBar('tnaTopUnits', d.top_productos, 'qty', '#A78BFA', 'unid.');
  renderProdBar('tnaTopRevenue', d.top_productos_revenue, 'revenue', '#FBBF24', CONFIG.currency, true);

  // Meses
  const mesesRec = d.meses.filter(m => m.revenue > 0).slice(-12);
  if (mesChartInst) mesChartInst.destroy();
  mesChartInst = new Chart($('mesChart').getContext('2d'), {
    type: 'bar',
    data: { labels: mesesRec.map(m => fmtMes(m.mes)), datasets: [
      { label: CONFIG.revenueLabel, data: mesesRec.map(m => m.revenue), backgroundColor: 'rgba(99,102,241,.75)', borderRadius: 6, borderSkipped: false },
      { label: 'Pedidos', data: mesesRec.map(m => m.count), type: 'line', yAxisID: 'yRight', borderColor: '#10B981', backgroundColor: 'transparent', borderWidth: 2.5, pointBackgroundColor: '#10B981', pointRadius: 4, tension: 0.35 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { font: { size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 } }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#F8FAFC', padding: 12, cornerRadius: 12, callbacks: { label: ctx => ctx.dataset.label === CONFIG.revenueLabel ? '  ' + fmtARS(ctx.raw) : '  Pedidos: ' + ctx.raw } } },
      scales: { y: { grid: { color: '#F1F5F9', drawBorder: false }, ticks: { callback: v => fmtARS(v), font: { size: 11 }, color: '#94A3B8', maxTicksLimit: 5 }, border: { display: false } }, yRight: { position: 'right', grid: { display: false }, ticks: { stepSize: 1, font: { size: 11 }, color: '#10B981', maxTicksLimit: 5 }, min: 0, border: { display: false } }, x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94A3B8', maxRotation: 0 }, border: { display: false } } }
    }
  });

  if (mesesRec.length >= 2) {
    const last = mesesRec[mesesRec.length-1].revenue, prev = mesesRec[mesesRec.length-2].revenue;
    const pct = prev > 0 ? Math.round((last-prev)/prev*100) : 0;
    const el = $('tnaMonthTrend'); el.classList.remove('hidden');
    el.textContent = (pct >= 0 ? '+' : '') + pct + '% vs mes ant.';
    el.className = 'text-xs font-bold px-2.5 py-1 rounded-full ' + (pct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700');
  }

  // Dias semana
  if (diasChartInst) diasChartInst.destroy();
  const maxDia = Math.max(...d.dias.map(x => x.count));
  diasChartInst = new Chart($('diasChart').getContext('2d'), {
    type: 'bar',
    data: { labels: d.dias.map(x => x.dia), datasets: [{ data: d.dias.map(x => x.count), backgroundColor: d.dias.map(x => x.count === maxDia ? '#F43F5E' : '#FDA4AF'), borderRadius: 6, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#F8FAFC', padding: 10, cornerRadius: 10, callbacks: { label: ctx => '  ' + ctx.raw + ' pedidos' } } }, scales: { y: { grid: { color: '#FFF1F2', drawBorder: false }, ticks: { font: { size: 11 }, color: '#94A3B8', maxTicksLimit: 5 }, border: { display: false } }, x: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' }, color: '#64748B' }, border: { display: false } } } }
  });
  const bestDay = d.dias.reduce((a, b) => b.count > a.count ? b : a);
  $('tnaBestDay').textContent = bestDay.dia + 's es el dia con mas pedidos (' + bestDay.count + ')';

  // Insight cards
  if (d.top_productos && d.top_productos.length) {
    const tp = d.top_productos[0];
    $('insightTopProd').textContent = tp.name;
    $('insightTopProdSub').textContent = tp.qty + ' unidades · ' + fmtARS(tp.revenue);
  }
  if (d.provincias && d.provincias.length) {
    const pr = d.provincias[0];
    const cnt = Array.isArray(pr) ? pr[1] : pr.count;
    const name = Array.isArray(pr) ? pr[0] : pr.prov;
    $('insightTopProv').textContent = name;
    $('insightTopProvSub').textContent = cnt + ' pedidos (' + Math.round(cnt/d.total_orders*100) + '%)';
  }
  if (d.pagos && d.pagos.length) {
    const pg = d.pagos[0];
    $('insightTopPago').textContent = pg.metodo;
    $('insightTopPagoSub').textContent = pg.count + ' pedidos (' + Math.round(pg.count/d.total_orders*100) + '%)';
  }

  // MoM insight
  const mom = d.comportamiento && d.comportamiento.mom_growth;
  if (mom != null) {
    $('insightMoM').textContent = (mom >= 0 ? '+' : '') + mom + '%';
    $('insightMoM').className = 'text-sm font-bold ' + (mom >= 0 ? 'text-emerald-700' : 'text-red-700');
  }

  // Comportamiento
  if (d.comportamiento) {
    const b = d.comportamiento;
    $('bUniqueCustomers').textContent = fmt(b.unique_customers);
    $('bRepeatRate').textContent = b.repeat_rate + '%';
    $('bRepeatSub').textContent = b.repeat_customers + ' clientes recurrentes';
    $('bAvgProducts').textContent = b.avg_products_per_order;
    $('bCuponPct').textContent = b.cupones_pct + '%';
    $('bCuponSub').textContent = b.cupones_total + ' ordenes con cupon';

    // Cupones detalle
    if (b.cupones_detalle && b.cupones_detalle.length) {
      $('tnaCuponesSection').classList.remove('hidden');
      $('tnaCuponesList').innerHTML = b.cupones_detalle.map(c =>
        `<div class="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2">
          <span class="font-bold text-yellow-800 text-sm">${c.code}</span>
          <span class="text-yellow-600 text-xs">${c.uses} usos</span>
        </div>`
      ).join('');
    }
  }

  // Hora pico
  if (d.horas) {
    const hAR = d.horas.map(h => ({ hora: (h.hora - 3 + 24) % 24, count: h.count })).sort((a,b) => a.hora - b.hora);
    const maxH = Math.max(...hAR.map(h => h.count));
    const bestHora = hAR.reduce((a,b) => b.count > a.count ? b : a);
    $('tnaHoraPicoLabel').textContent = bestHora.hora + ':00 hs — pico';
    if (horasChartInst) horasChartInst.destroy();
    horasChartInst = new Chart($('horasChart').getContext('2d'), {
      type: 'bar',
      data: { labels: hAR.map(h => h.hora + 'h'), datasets: [{ data: hAR.map(h => h.count), backgroundColor: hAR.map(h => h.count === maxH ? '#0EA5E9' : '#BAE6FD'), borderRadius: 4, borderSkipped: false }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#F8FAFC', padding: 10, cornerRadius: 10, callbacks: { label: ctx => '  ' + ctx.raw + ' pedidos' } } }, scales: { y: { grid: { color: '#F0F9FF', drawBorder: false }, ticks: { font: { size: 10 }, color: '#94A3B8', maxTicksLimit: 5 }, border: { display: false } }, x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#94A3B8', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, border: { display: false } } } }
    });
  }

  // Rangos de precio
  if (d.rangos) {
    if (rangosChartInst) rangosChartInst.destroy();
    rangosChartInst = new Chart($('rangosChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels: d.rangos.map(r => r.label), datasets: [{ data: d.rangos.map(r => r.count), backgroundColor: ['#6EE7B7','#34D399','#10B981','#059669','#047857','#065F46'], borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
      options: { cutout: '55%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, usePointStyle: true, pointStyleWidth: 7 } }, tooltip: { backgroundColor: '#1E293B', bodyColor: '#F8FAFC', padding: 10, cornerRadius: 10, callbacks: { label: ctx => '  ' + ctx.label + ': ' + ctx.raw + ' ordenes' } } } }
    });
  }

  // Ticket por provincia
  if (d.ticket_by_prov) {
    const maxTick = Math.max(...d.ticket_by_prov.map(p => p.avg_ticket));
    $('tnaTicketProv').innerHTML = d.ticket_by_prov.map(p => {
      const pct = Math.round(p.avg_ticket / maxTick * 100);
      return `<div class="bg-slate-50 rounded-xl p-3 text-center">
        <p class="text-xs font-bold text-slate-500 truncate">${p.prov}</p>
        <p class="text-base font-bold text-indigo-700 mt-1">${fmtARS(p.avg_ticket)}</p>
        <p class="text-xs text-slate-400">${p.count} ord.</p>
        <div class="mt-2 bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div style="width:${pct}%;height:100%;background:#6366F1;border-radius:999px;transition:width 1.2s ease"></div>
        </div>
      </div>`;
    }).join('');
  }

  $('tnaLastUpdate').textContent = 'Histórico de ' + CONFIG.storeName + ' · caché 30 min · ' + new Date().toLocaleTimeString(CONFIG.locale);
}

function renderProvBar(containerId, provincias, total) {
  const c = $(containerId);
  if (!c || !provincias) return;
  const maxVal = provincias[0][1];
  const colors = ['#6366F1','#8B5CF6','#06B6D4','#10B981','#F59E0B','#EF4444','#EC4899','#14B8A6','#3B82F6','#84CC16','#F97316','#A855F7'];
  c.innerHTML = provincias.map(([prov, count], i) => {
    const pct = Math.round(count / total * 100);
    const barPct = Math.round(count / maxVal * 100);
    return `<div class="flex items-center gap-3">
      <span class="text-xs font-semibold text-slate-600 w-28 text-right shrink-0 truncate">${prov}</span>
      <div class="flex-1 bg-slate-100 rounded-full overflow-hidden" style="height:24px">
        <div class="province-bar flex items-center px-2" style="width:${barPct}%;background:${colors[i%colors.length]};height:24px">
          <span class="text-white text-xs font-bold whitespace-nowrap">${count}</span>
        </div>
      </div>
      <span class="text-xs text-slate-400 w-8 text-right shrink-0">${pct}%</span>
    </div>`;
  }).join('');
}

function renderProdBar(containerId, productos, field, color, unit, isMoney = false) {
  const c = $(containerId);
  if (!c || !productos) return;
  const maxVal = productos[0][field];
  c.innerHTML = productos.map((p, i) => {
    const val = p[field];
    const barPct = Math.round(val / maxVal * 100);
    const displayVal = isMoney ? fmtARS(val) : val + ' ' + unit;
    const alpha = Math.max(0.3, 1 - i * 0.07);
    return `<div class="flex items-center gap-2">
      <span class="text-xs text-slate-600 truncate" style="min-width:0;flex:1">${p.name}</span>
      <div class="bg-slate-100 rounded overflow-hidden shrink-0" style="width:100px;height:18px">
        <div style="width:${barPct}%;height:18px;background:${color};opacity:${alpha};border-radius:4px;transition:width 1.2s cubic-bezier(.4,0,.2,1)"></div>
      </div>
      <span class="text-xs font-bold text-slate-700 shrink-0 w-16 text-right">${displayVal}</span>
    </div>`;
  }).join('');
}

// ═══ RESUMEN ═══════════════════════════════════════════════════════════════
