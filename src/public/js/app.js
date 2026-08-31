/* app — arranque
 *
 * Carga la configuración, elige la cuenta publicitaria y dispara la primera carga de datos.
 *
 * Scripts clásicos, sin bundler: se cargan en orden desde index.html y
 * comparten el mismo scope global. Cada nombre se declara una sola vez.
 */

/**
 * Dibuja la pantalla de primeros pasos y apaga el resto.
 *
 * Es lo que ve todo el que clona el repo antes de configurar nada. Antes eso
 * era un banner de error rojo sobre una pantalla vacía, que se lee como "esto
 * está roto" y no como "te falta el paso 1".
 */
function pintarPrimerosPasos() {
  const estado = CONFIG.integrations || {};

  $('homeSetupList').innerHTML = INTEGRACIONES.map((item) => {
    const listo = Boolean(estado[item.clave]?.configured);
    const titulo = item.clave === 'store' && estado.store?.name ? estado.store.name : item.titulo;
    return `<div class="flex items-start gap-5 py-5">
      <span class="shrink-0 mt-0.5 text-[11px] uppercase tracking-widest font-semibold ${listo ? 'text-emerald-700' : 'text-slate-400'}" style="width:4.5rem">
        ${listo ? 'Listo' : 'Falta'}
      </span>
      <div class="min-w-0 flex-grow">
        <p class="font-semibold text-slate-900">${titulo}${item.necesaria ? '' : ' <span class="text-slate-400 font-normal">· opcional</span>'}</p>
        <p class="text-sm text-slate-500 mt-1">${item.para}</p>
      </div>
      ${listo ? '' : `<code class="shrink-0 text-xs text-slate-400 whitespace-nowrap">${item.doc}</code>`}
    </div>`;
  }).join('');

  $('homeSetup').classList.remove('hidden');
  ['homeLoading', 'homeError', 'homeVerdict', 'homeActions', 'homeRules', 'homeCharts', 'homeGoNumbers']
    .forEach((id) => $(id)?.classList.add('hidden'));

  $('lastUpdated').textContent = 'Sin conectar';
  const sel = $('accountSelect');
  // value vacío a propósito: loadData() corta cuando no hay accountId. Con el
  // texto como valor, tocar Actualizar o un período disparaba un 400.
  sel.innerHTML = '<option value="">Sin cuenta</option>';
  sel.disabled = true;
}

async function init() {
  try {
    await cargarConfig();
    // Si falta una de las dos fuentes del cruce no tiene sentido pedir datos:
    // serían dos 503 y un error donde corresponde una guía.
    if (faltaLoEsencial()) return pintarPrimerosPasos();

    const res = await fetch('/api/accounts');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const accounts = data.data || [];
    const sel = $('accountSelect');
    if (!accounts.length) { showError('No hay cuentas publicitarias para este token.'); resumenEnError('No hay cuentas publicitarias para este token.'); return; }
    // El id crudo de la cuenta no se muestra nunca: identifica el negocio y no
    // le sirve a nadie leerlo. Si el token ve una sola cuenta, tampoco hay nada
    // que elegir, asi que el selector directamente no se dibuja.
    // Ojo: cuando la cuenta no tiene nombre puesto, Meta devuelve el propio id
    // como name, asi que no alcanza con mirar si viene vacio.
    const etiqueta = (a, i) => (a.name && !/^\D*\d{6,}\D*$/.test(a.name))
      ? a.name : `Cuenta publicitaria${accounts.length > 1 ? ' ' + (i + 1) : ''}`;
    sel.innerHTML = accounts.map((a, i) => `<option value="${a.id}">${etiqueta(a, i)}</option>`).join('');
    sel.classList.toggle('hidden', accounts.length < 2);
    await loadData();
  } catch (e) { showError(e.message); resumenEnError(e.message); }
}

async function loadData() {
  const accountId = $('accountSelect').value;
  if (!accountId) return;
  setLoading(true);
  hideError();
  resumenCargando('Trayendo campañas y ventas…');
  $('noSalesAlert').classList.add('hidden');
  try {
    const [cRes, iRes, dRes, tnRes, comparisonRes] = await Promise.all([
      fetch(`/api/campaigns?accountId=${accountId}`).then(r => r.json()),
      fetch(`/api/insights?accountId=${accountId}&datePreset=${currentDatePreset}&level=campaign`).then(r => r.json()),
      fetch(`/api/insights/daily?accountId=${accountId}&datePreset=${currentDatePreset}`).then(r => r.json()),
      fetch(`/api/store/stats?datePreset=${currentDatePreset}`).then(r => r.json()).catch(() => null),
      fetch(`/api/summary/comparison?accountId=${accountId}&datePreset=${currentDatePreset}`).then(r => r.json()).catch(() => null),
    ]);
    if (cRes.error) throw new Error(cRes.error);
    if (iRes.error) throw new Error(iRes.error);
    render(cRes.data || [], iRes.data || [], dRes.data || []);
    if (tnRes && !tnRes.error) renderTNStats(tnRes);
    $('lastUpdated').textContent = 'Actualizado: ' + new Date().toLocaleTimeString(CONFIG.locale);
    // El resumen se pinta al final, cuando ya estan los dos lados del cruce.
    lastComparisonData = comparisonRes && !comparisonRes.error ? comparisonRes : null;
      pintarResumenV2(lastMetaData, (tnRes && !tnRes.error) ? tnRes : null, lastComparisonData, iRes.data || [], dRes.data || []);
  } catch (e) { showError(e.message); resumenEnError(e.message); }
  finally { setLoading(false); }
}

// ---- Start ----
initMargen();
init();
