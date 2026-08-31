/* meta-ads — la pestaña Meta Ads
 *
 * Métricas de la Marketing API: embudo, campañas, frecuencia, tabla y el análisis escrito opcional.
 *
 * Scripts clásicos, sin bundler: se cargan en orden desde index.html y
 * comparten el mismo scope global. Cada nombre se declara una sola vez.
 */

// ---- Aggregate ----
function aggregate(insights) {
  let spend = 0, impressions = 0, clicks = 0, reach = 0;
  let purchases = 0, addToCart = 0, viewContent = 0, initiateCheckout = 0;
  for (const row of insights) {
    spend       += parseFloat(row.spend) || 0;
    impressions += parseInt(row.impressions) || 0;
    clicks      += parseInt(row.clicks) || 0;
    reach       += parseInt(row.reach) || 0;
    purchases        += getAction(row.actions, ['omni_purchase', 'purchase']);
    addToCart        += getAction(row.actions, ['omni_add_to_cart', 'add_to_cart']);
    viewContent      += getAction(row.actions, ['omni_view_content', 'view_content', 'onsite_web_view_content']);
    initiateCheckout += getAction(row.actions, ['omni_initiated_checkout', 'initiate_checkout', 'onsite_web_initiate_checkout']);
  }
  return {
    spend, impressions, clicks, reach, purchases, addToCart, viewContent, initiateCheckout,
    cpm: impressions > 0 ? spend / impressions * 1000 : 0,
    ctr: impressions > 0 ? clicks / impressions * 100 : 0,
    cpa: purchases > 0 ? spend / purchases : null,
    frequency: reach > 0 ? impressions / reach : 0,
  };
}

// ---- Render ----
function render(campaigns, insights, dailyData) {
  const t = aggregate(insights);
  lastMetaData = t;

  // KPIs
  countUp($('kpiSpend'), Math.round(t.spend), 900, 'currency');
  countUp($('kpiImpressions'), t.impressions);
  $('kpiCTR').textContent    = fmt(t.ctr, 2) + '%';
  $('kpiCPM').textContent    = fmtARS(t.cpm);
  countUp($('kpiPurchases'), t.purchases);
  $('kpiCPA').textContent    = t.cpa != null ? fmtARS(t.cpa) : t.purchases === 0 ? 'Sin ventas' : '—';

  // Color compras
  const card = $('kpiPurchasesCard');
  if (t.purchases === 0 && t.spend > 0) {
    card.className = card.className.replace('card-green', 'card-red');
    $('kpiPurchases').className = 'kpi-number text-red-700 mt-3';
    $('kpiPurchasesLabel').className = 'text-xs font-bold text-red-600/70 uppercase tracking-widest';
    $('kpiPurchasesIcon').className = 'icon-red w-9 h-9 rounded-xl flex items-center justify-center shrink-0';
    $('noSalesAlert').classList.remove('hidden');
  } else {
    card.className = card.className.replace('card-red', 'card-green');
    $('kpiPurchases').className = 'kpi-number text-emerald-900 mt-3';
    $('kpiPurchasesLabel').className = 'text-xs font-bold text-emerald-600/70 uppercase tracking-widest';
    $('kpiPurchasesIcon').className = 'icon-green w-9 h-9 rounded-xl flex items-center justify-center shrink-0';
  }

  // Funnel
  renderFunnel(t);

  // Campanas estado + frecuencia
  renderStatus(campaigns, insights);
  renderFrequency(t);
  renderRecommendations(t, campaigns);

  // Tabla
  renderTable(campaigns, insights);

  // Grafico
  renderChart(dailyData);
}

function renderFunnel(t) {
  const top = Math.max(t.viewContent, t.addToCart, 1);

  function setStep(barId, valId, pctId, value, total) {
    const w = total > 0 ? Math.max((value / top) * 100, value > 0 ? 4 : 0) : 0;
    setTimeout(() => { $(barId).style.width = w + '%'; }, 100);
    $(valId).textContent = fmt(value);
    $(pctId).textContent = value > 0 ? pctOf(value, total) + '%' : '0%';
  }

  setStep('barView',     'valView',     'pctView',     t.viewContent,      t.viewContent);
  setStep('barCart',     'valCart',     'pctCart',     t.addToCart,        t.viewContent);
  setStep('barCheckout', 'valCheckout', 'pctCheckout', t.initiateCheckout, t.viewContent);
  setStep('barPurchase', 'valPurchase', 'pctPurchase', t.purchases,        t.viewContent);

  // Drop indicators
  function showDrop(id, valId, from, to, label) {
    const el = $(id);
    if (from > 0 && to >= 0) {
      const drop = Math.round((1 - to / from) * 100);
      $(valId).textContent = drop + '% no ' + label;
      el.classList.remove('hidden');
      el.style.display = 'flex';
    } else {
      el.classList.add('hidden');
    }
  }
  showDrop('dropView2Cart',      'dropView2CartVal',        t.viewContent,       t.addToCart,        'agrego al carrito');
  showDrop('dropCart2Checkout',  'dropCart2CheckoutVal',    t.addToCart,         t.initiateCheckout, 'inicio el pago');
  showDrop('dropCheckout2Purchase','dropCheckout2PurchaseVal', t.initiateCheckout, t.purchases,      'completo la compra');

  // Insight
  const ins = $('funnelInsight');
  if (t.addToCart > 0 && t.purchases === 0) {
    ins.className = 'mt-5 p-4 rounded-xl text-sm font-medium border bg-red-50 border-red-200 text-red-800';
    ins.innerHTML = `<strong>Problema critico:</strong> ${fmt(t.addToCart)} personas agregaron al carrito pero <strong>ninguna compro</strong>. El problema esta en el checkout, precio de envio o medios de pago.`;
    ins.classList.remove('hidden');
  } else if (t.initiateCheckout > 0 && t.purchases > 0) {
    const drop = Math.round((1 - t.purchases / t.initiateCheckout) * 100);
    if (drop > 50) {
      ins.className = 'mt-5 p-4 rounded-xl text-sm font-medium border bg-amber-50 border-amber-200 text-amber-800';
      ins.innerHTML = `<strong>Atencion:</strong> El ${drop}% de quienes iniciaron el pago no completaron la compra. Revisa friccion en el ultimo paso del checkout.`;
      ins.classList.remove('hidden');
    } else { ins.classList.add('hidden'); }
  } else { ins.classList.add('hidden'); }
}

function renderStatus(campaigns, insights) {
  const active = campaigns.filter(c => c.effective_status === 'ACTIVE');
  const paused = campaigns.filter(c => c.effective_status !== 'ACTIVE');
  $('countActive').textContent = active.length;
  $('countPaused').textContent = paused.length;

  const list = $('activeCampaignsList');
  if (!active.length) {
    list.innerHTML = '<div class="p-3 bg-red-50 border border-red-200 rounded-xl"><p class="text-sm font-bold text-red-700">Ninguna campana activa</p><p class="text-xs text-red-500 mt-0.5">No se esta gastando presupuesto</p></div>';
  } else {
    list.innerHTML = active.map(c => {
      const ins = insights.find(i => i.campaign_id === c.id);
      const spent = ins ? fmtARS(parseFloat(ins.spend)) : '—';
      return `<div class="flex items-center justify-between gap-2 p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2 h-2 bg-emerald-400 rounded-full shrink-0" style="animation:pulse 2s infinite"></span>
          <p class="text-xs font-medium text-slate-700 truncate">${truncate(c.name, 30)}</p>
        </div>
        <span class="text-xs font-bold text-emerald-700 shrink-0 tabular-nums">${spent}</span>
      </div>`;
    }).join('');
  }

  const budget = active.reduce((s, c) => s + (c.daily_budget ? parseInt(c.daily_budget) / 100 : 0), 0);
  if (budget > 0) {
    $('budgetInfo').classList.remove('hidden');
    $('budgetValue').textContent = fmtARS(budget);
  }
}

function renderFrequency(t) {
  const freq = t.frequency;
  const card   = $('frequencyCard');
  const valEl  = $('freqValue');
  const barEl  = $('freqBar');
  const statEl = $('freqStatus');

  valEl.textContent = freq > 0 ? fmt(freq, 1) + 'x' : '—';
  const barPct = Math.min((freq / 5) * 100, 100);
  setTimeout(() => { barEl.style.width = barPct + '%'; }, 150);

  if (freq >= 3.5) {
    barEl.style.background = '#EF4444';
    statEl.textContent = 'Quemado';
    statEl.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700';
    card.className = 'p-4 rounded-xl border bg-red-50 border-red-200';
    valEl.className = 'text-2xl font-bold mt-0.5 text-red-700';
  } else if (freq >= 2.5) {
    barEl.style.background = '#F59E0B';
    statEl.textContent = 'Atencion';
    statEl.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700';
    card.className = 'p-4 rounded-xl border bg-amber-50 border-amber-200';
    valEl.className = 'text-2xl font-bold mt-0.5 text-amber-700';
  } else if (freq > 0) {
    barEl.style.background = '#10B981';
    statEl.textContent = 'Saludable';
    statEl.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700';
    card.className = 'p-4 rounded-xl border bg-emerald-50 border-emerald-200';
    valEl.className = 'text-2xl font-bold mt-0.5 text-emerald-700';
  }
}

function renderRecommendations(t, campaigns) {
  const recs = [];

  const ICONS = {
    critical: `<div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>`,
    warning:  `<div class="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>`,
    info:     `<div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>`,
    success:  `<div class="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0"><svg class="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>`,
  };
  const BADGES = {
    critical: '<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Urgente</span>',
    warning:  '<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Atencion</span>',
    info:     '<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Info</span>',
    success:  '<span class="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Bien</span>',
  };
  const BG = {
    critical: 'bg-red-50 border-red-100',
    warning:  'bg-amber-50 border-amber-100',
    info:     'bg-blue-50 border-blue-100',
    success:  'bg-emerald-50 border-emerald-100',
  };

  // 1. Sin ventas con gasto
  if (t.purchases === 0 && t.spend > 0) {
    recs.push({ p:'critical', title:'Sin ventas — pero hay gasto activo', text:`Se gastaron ${fmtARS(t.spend)} y no se registro ninguna compra. Hace una compra de prueba en la tienda para verificar que el checkout funciona. También revisá que el checkout y los métodos de pago funcionen correctamente.` });
  }

  // 2. Frecuencia quemada
  if (t.frequency >= 3.5) {
    recs.push({ p:'critical', title:`Audiencia quemada — frecuencia ${fmt(t.frequency,1)}x`, text:`La misma persona ve tu anuncio ${fmt(t.frequency,1)} veces en promedio. Con mas de 3.5x el CTR cae, el CPM sube y Meta empieza a mostrar el anuncio en peores posiciones. Renova los creativos urgente.` });
  } else if (t.frequency >= 2.5) {
    recs.push({ p:'warning', title:`Frecuencia en zona de alerta — ${fmt(t.frequency,1)}x`, text:`Estas cerca del limite de fatiga (3.5x). Por encima de ese valor el rendimiento cae. Prepara creativos nuevos ahora antes de que el problema empeore.` });
  }

  // 3. Sin retargeting
  const hasRetargeting = campaigns.some(c => c.effective_status === 'ACTIVE' && /retarget|retargeting|remarketing|cierre/i.test(c.name));
  if (!hasRetargeting && t.addToCart > 3) {
    recs.push({ p:'warning', title:'Sin retargeting activo', text:`${fmt(t.addToCart)} personas agregaron productos al carrito pero no compraron. Una campana de retargeting orientada a estos visitantes puede recuperar esas ventas a un costo muy bajo. Es el cambio con mejor relacion esfuerzo/resultado.` });
  }

  // 4. Carrito sin compras
  if (t.addToCart > 0 && t.purchases === 0) {
    recs.push({ p:'critical', title:'Gente en el carrito pero nadie compra', text:`${fmt(t.addToCart)} personas agregaron al carrito y 0 compraron. Esto apunta a un problema en la tienda, no en los anuncios. Revisa: costo de envio visible antes del checkout, medios de pago disponibles (Mercado Pago, tarjetas), y que no haya errores al finalizar la compra.` });
  } else if (t.initiateCheckout > 0 && t.purchases > 0) {
    const drop = Math.round((1 - t.purchases / t.initiateCheckout) * 100);
    if (drop > 55) recs.push({ p:'warning', title:`${drop}% abandona en el ultimo paso del pago`, text:`De ${fmt(t.initiateCheckout)} que iniciaron el pago, solo ${fmt(t.purchases)} compraron. Demasiada friccion en el checkout final. Revisa si el proceso de pago tiene muchos pasos o si hay errores en el ultimo paso.` });
  }

  // 5. CPM alto
  if (t.cpm > 2500 && t.impressions > 500) {
    recs.push({ p:'warning', title:`CPM alto — ${fmtARS(t.cpm)} por 1000 impresiones`, text:`El costo de alcanzar a la audiencia subio. Causas posibles: audiencia chica y saturada, anuncio con baja relevancia, o mucha competencia en esa subasta. Probá ampliar la audiencia o usar intereses diferentes.` });
  }

  // 6. Una sola campana activa
  const activeCount = campaigns.filter(c => c.effective_status === 'ACTIVE').length;
  if (activeCount === 1 && campaigns.length > 2) {
    recs.push({ p:'info', title:'Todo el presupuesto en una sola campana', text:`Tenes ${campaigns.length} campanas en total pero solo 1 activa. Es riesgoso concentrar todo en un lugar. Si esa campana empieza a fallar, no hay respaldo. Considera activar una segunda con audiencia o creativo diferente.` });
  }

  // 7. CTR positivo
  if (t.ctr > 4) {
    recs.push({ p:'success', title:`Buen CTR — ${fmt(t.ctr,2)}%`, text:`El creativo esta funcionando bien para generar clicks (promedio de la industria: 1-3%). El problema no esta en el anuncio sino en lo que pasa despues en la tienda. Arreglando el checkout deberia haber ventas.` });
  }

  // 8. CPA eficiente
  if (t.cpa != null && t.cpa < 8000 && t.purchases >= 3) {
    recs.push({ p:'success', title:`CPA eficiente — ${fmtARS(t.cpa)} por venta`, text:`El costo por venta esta en buen nivel. Si el checkout mejora y la frecuencia se mantiene baja, podria ser buen momento para escalar el presupuesto gradual (no mas del 20% por dia para no resetear el aprendizaje).` });
  }

  // Render
  const el = $('recommendationsList');
  if (!recs.length) {
    el.innerHTML = '<div class="text-center py-4 text-slate-300 text-sm">No hay datos suficientes para generar recomendaciones.</div>';
    return;
  }
  // Orden: critical primero, luego warning, info, success
  const order = { critical:0, warning:1, info:2, success:3 };
  recs.sort((a,b) => order[a.p] - order[b.p]);

  el.innerHTML = recs.map(r => `
    <div class="flex gap-4 p-4 rounded-xl border ${BG[r.p]}">
      ${ICONS[r.p]}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap mb-1">
          ${BADGES[r.p]}
          <p class="font-bold text-slate-800 text-sm">${r.title}</p>
        </div>
        <p class="text-sm text-slate-600 leading-relaxed">${r.text}</p>
      </div>
    </div>`).join('');
}

function renderTable(campaigns, insights) {
  const tbody = $('campaignsTableBody');
  const rows = campaigns.map(c => {
    const ins = insights.find(i => i.campaign_id === c.id);
    const spend = ins ? parseFloat(ins.spend) : 0;
    return { c, ins, spend, active: c.effective_status === 'ACTIVE' };
  }).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.spend - a.spend;
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-12 text-center text-slate-300 text-sm">Sin campanas</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(({ c, ins, spend, active }) => {
    const impr     = ins ? parseInt(ins.impressions) : 0;
    const ctr      = ins ? parseFloat(ins.ctr) : 0;
    const purchases = ins ? getAction(ins.actions, ['omni_purchase', 'purchase']) : 0;
    const cpa      = purchases > 0 ? spend / purchases : null;
    const badge    = active
      ? '<span class="badge-active inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Activa</span>'
      : '<span class="badge-paused inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Pausada</span>';

    const purchasesCell = purchases === 0 && spend > 0
      ? `<td class="px-4 py-4 text-right"><span class="font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">0</span></td>`
      : `<td class="px-4 py-4 text-right font-semibold ${purchases > 0 ? 'text-emerald-600' : 'text-slate-300'}">${fmt(purchases)}</td>`;

    const opacity = !active && spend === 0 ? 'opacity-40' : '';
    return `<tr class="data-row border-t border-slate-50 ${opacity}">
      <td class="px-6 py-4">
        <p class="font-semibold text-slate-800 truncate max-w-xs" title="${c.name}">${truncate(c.name, 44)}</p>
      </td>
      <td class="px-4 py-4">${badge}</td>
      <td class="px-4 py-4 text-right font-semibold text-slate-700 tabular-nums">${spend > 0 ? fmtARS(spend) : '<span class="text-slate-300">—</span>'}</td>
      <td class="px-4 py-4 text-right text-slate-500 tabular-nums">${impr > 0 ? fmt(impr) : '<span class="text-slate-300">—</span>'}</td>
      <td class="px-4 py-4 text-right text-slate-500 tabular-nums">${ctr > 0 ? fmt(ctr, 2) + '%' : '<span class="text-slate-300">—</span>'}</td>
      ${purchasesCell}
      <td class="px-4 py-4 text-right text-slate-500 tabular-nums">${cpa != null ? fmtARS(cpa) : '<span class="text-slate-300">—</span>'}</td>
    </tr>`;
  }).join('');
}

function renderChart(dailyData) {
  const canvas = $('dailyChart');
  const empty  = $('chartEmpty');

  if (!dailyData || !dailyData.length) {
    canvas.style.display = 'none';
    empty.classList.remove('hidden');
    return;
  }
  canvas.style.display = 'block';
  empty.classList.add('hidden');

  const sorted = [...dailyData].sort((a, b) => a.date_start > b.date_start ? 1 : -1);
  const labels = sorted.map(d => {
    const [,m,day] = d.date_start.split('-');
    return `${day}/${m}`;
  });
  const spendData    = sorted.map(d => parseFloat(d.spend) || 0);
  const purchaseData = sorted.map(d => getAction(d.actions, ['omni_purchase', 'purchase']));

  if (chart) chart.destroy();

  const ctx = canvas.getContext('2d');
  const spendGrad = ctx.createLinearGradient(0, 0, 0, 280);
  spendGrad.addColorStop(0, 'rgba(59,130,246,.25)');
  spendGrad.addColorStop(1, 'rgba(59,130,246,.02)');

  chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: CONFIG.spendLabel,
          data: spendData,
          backgroundColor: spendGrad,
          borderColor: '#3B82F6',
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
          yAxisID: 'ySpend',
        },
        {
          label: 'Compras',
          data: purchaseData,
          type: 'line',
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,.1)',
          borderWidth: 3,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#10B981',
          pointBorderWidth: 2.5,
          pointRadius: 5,
          pointHoverRadius: 8,
          tension: 0.4,
          fill: true,
          yAxisID: 'yPurchases',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#94A3B8',
          bodyColor: '#F8FAFC',
          padding: 12,
          cornerRadius: 12,
          callbacks: {
            label: ctx => ctx.dataset.label === CONFIG.spendLabel
              ? '  Gasto: $' + fmt(ctx.raw)
              : '  Compras: ' + ctx.raw
          }
        }
      },
      scales: {
        ySpend: {
          position: 'left',
          grid: { color: '#F1F5F9', drawBorder: false },
          ticks: { callback: v => '$' + fmt(v), font: { size: 11 }, color: '#94A3B8', maxTicksLimit: 6 },
          border: { display: false }
        },
        yPurchases: {
          position: 'right',
          grid: { display: false },
          ticks: { stepSize: 1, font: { size: 11, weight: '600' }, color: '#10B981', maxTicksLimit: 5 },
          min: 0,
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#94A3B8', maxRotation: 0 },
          border: { display: false }
        }
      }
    }
  });
}

// ---- AI Analysis ----
async function runAnalysis() {
  if (!lastMetaData) { alert('Primero carga los datos de Meta Ads'); return; }
  const btn = $('analyzeBtn');
  btn.disabled = true; btn.style.opacity = '0.6';
  $('analysisEmpty').classList.add('hidden');
  $('analysisResult').classList.add('hidden');
  $('analysisLoading').classList.remove('hidden');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metaData: lastMetaData, tnData: lastTNData || {}, datePreset: currentDatePreset })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const sections = data.analysis.split('\n\n').filter(s => s.trim());
    const SECTION_COLORS = {
      'DIAGNÓSTICO': 'bg-blue-50 border-blue-100 text-blue-900',
      'PROBLEMA PRINCIPAL': 'bg-red-50 border-red-100 text-red-900',
      'CAUSAS': 'bg-amber-50 border-amber-100 text-amber-900',
      'ACCIONES URGENTES': 'bg-purple-50 border-purple-100 text-purple-900',
      'OPORTUNIDAD': 'bg-emerald-50 border-emerald-100 text-emerald-900',
    };
    const ICONS = {
      'DIAGNÓSTICO': '🔍',
      'PROBLEMA PRINCIPAL': '🚨',
      'CAUSAS': '📊',
      'ACCIONES URGENTES': '⚡',
      'OPORTUNIDAD': '💡',
    };

    $('analysisContent').innerHTML = sections.map(section => {
      const lines = section.split('\n');
      const title = lines[0].replace(':', '').trim();
      const body = lines.slice(1).join('\n').trim();
      const colorClass = SECTION_COLORS[title] || 'bg-slate-50 border-slate-100 text-slate-800';
      const icon = ICONS[title] || '•';
      return `<div class="p-4 rounded-xl border ${colorClass}">
        <p class="text-xs font-bold uppercase tracking-widest mb-2 opacity-60">${icon} ${title}</p>
        <p class="text-sm leading-relaxed whitespace-pre-line">${body}</p>
      </div>`;
    }).join('');

    $('analysisLoading').classList.add('hidden');
    $('analysisResult').classList.remove('hidden');
  } catch(e) {
    $('analysisLoading').classList.add('hidden');
    $('analysisEmpty').classList.remove('hidden');
    $('analysisContent').innerHTML = `<div class="p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">Error: ${e.message}</div>`;
    $('analysisResult').classList.remove('hidden');
  }
  btn.disabled = false; btn.style.opacity = '1';
}
