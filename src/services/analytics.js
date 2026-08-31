'use strict';

const nombres = require('../data/nombres-ar.json');

const NOMBRES_F = new Set(nombres.femeninos);
const NOMBRES_M = new Set(nombres.masculinos);

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_ORDEN = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Todo lo que se calcula sobre pedidos normalizados vive acá, en funciones
 * puras: entran pedidos, salen números. Sin red, sin fechas del sistema, sin
 * estado. Eso es lo que las hace testeables.
 */

/* ── periodo ────────────────────────────────────────────────────────────── */

/** Resumen de un período: lo que consume la pestaña Resumen y la de Tienda. */
function summarizePeriod(orders, abandoned = []) {
  const revenue = sum(orders, (o) => o.total);
  const count = orders.length;

  const productMap = new Map();
  for (const order of orders) {
    for (const p of order.products) {
      const entry = productMap.get(p.name) || { name: p.name, qty: 0, revenue: 0 };
      entry.qty += p.quantity;
      entry.revenue += p.price * p.quantity;
      productMap.set(p.name, entry);
    }
  }

  const dayMap = new Map();
  for (const order of orders) {
    if (!order.createdAt) continue;
    const day = order.createdAt.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) || 0) + order.total);
  }

  return {
    orders: count,
    revenue,
    avgTicket: count > 0 ? revenue / count : 0,
    shippingTotal: sum(orders, (o) => o.shippingCost),
    topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    revenueByDay: [...dayMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, revenue]) => ({ date, revenue })),
    abandoned: abandoned.slice(0, 10).map((o) => ({
      number: o.number,
      name: o.customerName || 'Sin nombre',
      total: o.total,
      created_at: o.createdAt,
      payment_method: o.paymentMethod,
      products: o.products.map((p) => p.name).slice(0, 2).join(', '),
    })),
    abandonedCount: abandoned.length,
    abandonedTotal: sum(abandoned, (o) => o.total),
  };
}

/* ── historico ──────────────────────────────────────────────────────────── */

const DEFAULT_PRICE_BUCKETS = [20000, 30000, 40000, 50000, 70000];

/**
 * Análisis sobre el histórico completo de la tienda.
 *
 * @param {Array} orders pedidos normalizados
 * @param {object} opts
 * @param {boolean} opts.inferGender heurística por nombre de pila (ver abajo)
 * @param {number[]} opts.priceBuckets cortes de los rangos de ticket
 */
function buildHistoricalAnalytics(orders, { inferGender: useGender = false, priceBuckets = DEFAULT_PRICE_BUCKETS, locale = 'es-AR' } = {}) {
  const provinciaCount = new Map();
  const provinciaRevenue = new Map();
  const productos = new Map();
  const pagos = new Map();
  const meses = new Map();
  const dias = new Map();
  const horas = new Map();
  const emailOrders = new Map();
  const cupones = new Map();

  const rangos = buildBuckets(priceBuckets, locale);
  const genero = { hombres: 0, mujeres: 0, sinDato: 0 };
  let cuponesTotal = 0;
  let unidadesTotal = 0;

  for (const o of orders) {
    const prov = o.province || 'Sin datos';
    provinciaCount.set(prov, (provinciaCount.get(prov) || 0) + 1);
    provinciaRevenue.set(prov, (provinciaRevenue.get(prov) || 0) + o.total);

    for (const p of o.products) {
      const entry = productos.get(p.name) || { qty: 0, revenue: 0 };
      entry.qty += p.quantity;
      entry.revenue += p.price * p.quantity;
      productos.set(p.name, entry);
      unidadesTotal += p.quantity;
    }

    pagos.set(o.paymentMethodLabel, (pagos.get(o.paymentMethodLabel) || 0) + 1);

    if (o.createdAt) {
      const date = new Date(o.createdAt);
      const mesKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const mes = meses.get(mesKey) || { count: 0, revenue: 0 };
      mes.count += 1;
      mes.revenue += o.total;
      meses.set(mesKey, mes);

      const dia = DIAS[date.getDay()];
      dias.set(dia, (dias.get(dia) || 0) + 1);

      const hora = localHour(o.createdAt);
      if (hora !== null) horas.set(hora, (horas.get(hora) || 0) + 1);
    }

    bucketFor(rangos, o.total).count += 1;

    if (o.email) emailOrders.set(o.email, (emailOrders.get(o.email) || 0) + 1);

    if (o.coupons.length) {
      cuponesTotal += 1;
      for (const code of o.coupons) cupones.set(code, (cupones.get(code) || 0) + 1);
    }

    if (useGender) {
      const g = inferGender(o.customerName);
      if (g === 'mujer') genero.mujeres += 1;
      else if (g === 'hombre') genero.hombres += 1;
      else genero.sinDato += 1;
    }
  }

  const totalOrders = orders.length;
  const totalRevenue = sum(orders, (o) => o.total);

  const compras = [...emailOrders.values()];
  const uniqueCustomers = compras.length;
  const repeatCustomers = compras.filter((n) => n > 1).length;

  const provinciasOrdenadas = [...provinciaCount.entries()].sort((a, b) => b[1] - a[1]);
  const avgTicketProv = ([prov, count]) => ({
    prov,
    count,
    avg_ticket: Math.round(provinciaRevenue.get(prov) / count),
  });

  const mesesArr = [...meses.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({ mes, ...v }));

  return {
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    ticket_promedio: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    genero: useGender ? genero : null,
    provincias: provinciasOrdenadas.slice(0, 12).map(avgTicketProv),
    ticket_by_prov: provinciasOrdenadas
      .filter(([, count]) => count >= 5)
      .sort((a, b) => provinciaRevenue.get(b[0]) / b[1] - provinciaRevenue.get(a[0]) / a[1])
      .slice(0, 8)
      .map(avgTicketProv),
    top_productos: topEntries(productos, (d) => d.qty, 12),
    top_productos_revenue: topEntries(productos, (d) => d.revenue, 10),
    pagos: [...pagos.entries()].sort((a, b) => b[1] - a[1]).map(([metodo, count]) => ({ metodo, count })),
    meses: mesesArr,
    dias: DIAS_ORDEN.map((dia) => ({ dia, count: dias.get(dia) || 0 })),
    horas: Array.from({ length: 24 }, (_, hora) => ({ hora, count: horas.get(hora) || 0 })),
    rangos: rangos.map(({ label, count }) => ({ label, count })),
    comportamiento: {
      unique_customers: uniqueCustomers,
      repeat_customers: repeatCustomers,
      repeat_rate: uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 100) : 0,
      avg_products_per_order: totalOrders > 0 ? +(unidadesTotal / totalOrders).toFixed(1) : 0,
      cupones_total: cuponesTotal,
      cupones_pct: totalOrders > 0 ? Math.round((cuponesTotal / totalOrders) * 100) : 0,
      cupones_detalle: [...cupones.entries()].sort((a, b) => b[1] - a[1]).map(([code, uses]) => ({ code, uses })),
      mom_growth: monthOverMonth(mesesArr),
    },
  };
}

/* ── auxiliares ─────────────────────────────────────────────────────────── */

function sum(list, pick) {
  return list.reduce((acc, item) => acc + (pick(item) || 0), 0);
}

function topEntries(map, pick, limit) {
  return [...map.entries()]
    .sort((a, b) => pick(b[1]) - pick(a[1]))
    .slice(0, limit)
    .map(([name, d]) => ({ name, qty: d.qty, revenue: d.revenue }));
}

function buildBuckets(edges, locale) {
  const fmt = (n) => (n >= 1000 ? `$${Math.round(n / 1000).toLocaleString(locale)}K` : `$${n}`);
  const buckets = [];
  edges.forEach((edge, i) => {
    buckets.push({
      max: edge,
      count: 0,
      label: i === 0 ? `< ${fmt(edge)}` : `${fmt(edges[i - 1])} – ${fmt(edge)}`,
    });
  });
  buckets.push({ max: Infinity, count: 0, label: `> ${fmt(edges[edges.length - 1])}` });
  return buckets;
}

function bucketFor(buckets, value) {
  return buckets.find((b) => value < b.max) || buckets[buckets.length - 1];
}

/**
 * Hora del pedido **en la zona horaria de la tienda**, leída del offset que
 * viene en el propio timestamp (`...T14:03:11-0300`).
 *
 * Antes esto usaba `getUTCHours()`: para una tienda argentina la "hora pico"
 * salía tres horas corrida.
 */
function localHour(iso) {
  if (!iso) return null;
  const m = String(iso).match(/T(\d{2}):/);
  if (!m) return null;
  return Number(m[1]);
}

function monthOverMonth(mesesArr) {
  const conVentas = mesesArr.filter((m) => m.revenue > 0);
  if (conVentas.length < 2) return null;
  const last = conVentas[conVentas.length - 1].revenue;
  const prev = conVentas[conVentas.length - 2].revenue;
  return prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
}

/**
 * Heurística de género por nombre de pila, contra un diccionario de nombres
 * frecuentes en Argentina (`src/data/nombres-ar.json`).
 *
 * Está apagada por defecto (`FEATURE_INFER_GENDER`). Es una inferencia sobre
 * datos personales: se equivoca, depende del país, y no aplica a nadie fuera
 * del binario. Prendela solo si sabés que tu base está cubierta y para qué la
 * vas a usar.
 */
function inferGender(name) {
  if (!name) return 'sin_dato';
  const first = String(name).toLowerCase().trim().split(/\s+/)[0];
  if (!first) return 'sin_dato';
  if (NOMBRES_F.has(first)) return 'mujer';
  if (NOMBRES_M.has(first)) return 'hombre';
  return 'sin_dato';
}

module.exports = {
  summarizePeriod,
  buildHistoricalAnalytics,
  inferGender,
  localHour,
  DEFAULT_PRICE_BUCKETS,
};
