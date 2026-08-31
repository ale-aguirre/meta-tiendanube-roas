'use strict';

/**
 * Datos sintéticos para el modo demo.
 *
 * Deterministas a propósito: la misma fecha da siempre los mismos números, así
 * una captura de pantalla se puede repetir y un bug en la interfaz no se
 * confunde con ruido del generador.
 *
 * No hay nada real acá. Los productos, las campañas y los compradores están
 * inventados.
 */

const CAMPANAS = [
  { id: '1001', nombre: 'Ventas · Advantage+', objetivo: 'OUTCOME_SALES', presupuestoDiario: 4500000, ctr: 1.84, roas: 5.4 },
  { id: '1002', nombre: 'Ventas · Retargeting 30d', objetivo: 'OUTCOME_SALES', presupuestoDiario: 2000000, ctr: 3.02, roas: 6.8 },
  { id: '1003', nombre: 'Ventas · Público frío', objetivo: 'OUTCOME_SALES', presupuestoDiario: 1500000, ctr: 0.71, roas: 0 },
  { id: '1004', nombre: 'Reconocimiento · Video', objetivo: 'OUTCOME_AWARENESS', presupuestoDiario: 0, ctr: 0, roas: 0, pausada: true },
];

const PRODUCTOS = [
  { id: '9001', nombre: 'Buzo oversize gris', precio: 42000, peso: 26 },
  { id: '9002', nombre: 'Campera de jean', precio: 68000, peso: 20 },
  { id: '9003', nombre: 'Pantalón cargo negro', precio: 39000, peso: 18 },
  { id: '9004', nombre: 'Remera básica blanca', precio: 18000, peso: 16 },
  { id: '9005', nombre: 'Zapatillas urbanas', precio: 95000, peso: 12 },
  { id: '9006', nombre: 'Gorra bordada', precio: 14000, peso: 8 },
];

const PROVINCIAS = [
  { nombre: 'Buenos Aires', peso: 34 }, { nombre: 'Córdoba', peso: 18 },
  { nombre: 'Capital Federal', peso: 14 }, { nombre: 'Santa Fe', peso: 10 },
  { nombre: 'Mendoza', peso: 7 }, { nombre: 'Tucumán', peso: 5 },
  { nombre: 'Neuquén', peso: 4 }, { nombre: 'Salta', peso: 4 },
  { nombre: 'Entre Ríos', peso: 2 }, { nombre: 'Chubut', peso: 2 },
];

const PAGOS = [
  { metodo: 'credit_card', etiqueta: 'Tarjeta de crédito', peso: 52 },
  { metodo: 'wallet', etiqueta: 'Billetera virtual', peso: 22 },
  { metodo: 'wire_transfer', etiqueta: 'Transferencia', peso: 15 },
  { metodo: 'debit_card', etiqueta: 'Tarjeta de débito', peso: 8 },
  { metodo: 'ticket', etiqueta: 'Efectivo / cupón de pago', peso: 3 },
];

/** PRNG con semilla (mulberry32). Sin esto cada carga daría otros números. */
function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un entero derivado de la fecha, para que un día siempre dé lo mismo. */
function semillaDe(fecha) {
  return fecha.getFullYear() * 10000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();
}

function elegir(lista, r) {
  const total = lista.reduce((a, x) => a + x.peso, 0);
  let n = r() * total;
  for (const item of lista) {
    n -= item.peso;
    if (n <= 0) return item;
  }
  return lista[lista.length - 1];
}

/**
 * Órdenes de un día. La cantidad sube los fines de semana y baja los lunes,
 * que es la forma que tiene una tienda de verdad y hace que el gráfico diario
 * no sea una línea plana.
 */
function ordenesDelDia(fecha) {
  const r = rng(semillaDe(fecha));
  const factorDia = [0.7, 0.8, 0.95, 1.0, 1.15, 1.35, 1.2][fecha.getDay()];
  const cuantas = Math.max(0, Math.round((2 + r() * 4) * factorDia));

  return Array.from({ length: cuantas }, (_, i) => {
    const items = 1 + (r() < 0.35 ? 1 : 0);
    const productos = Array.from({ length: items }, () => {
      const p = elegir(PRODUCTOS, r);
      return { id: p.id, name: p.nombre, quantity: 1 + (r() < 0.15 ? 1 : 0), price: p.precio };
    });
    const total = productos.reduce((a, p) => a + p.price * p.quantity, 0);
    const pago = elegir(PAGOS, r);
    const hora = 9 + Math.floor(r() * 14);
    const creado = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hora, Math.floor(r() * 60));

    return {
      id: `${semillaDe(fecha)}${i}`,
      number: String(1000 + Math.floor(r() * 9000)),
      createdAt: creado.toISOString(),
      total,
      currency: 'ARS',
      shippingCost: total > 60000 ? 0 : 6500,
      // Emails de ejemplo.com: el dominio esta reservado por la IANA para esto.
      email: `compradora${Math.floor(r() * 260)}@ejemplo.com`,
      customerName: null,
      province: elegir(PROVINCIAS, r).nombre,
      paymentMethod: pago.metodo,
      paymentMethodLabel: pago.etiqueta,
      coupons: r() < 0.12 ? ['BIENVENIDA'] : [],
      products: productos,
    };
  });
}

/** Todas las órdenes en [start, end). */
function ordenesEntre(start, end) {
  const out = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor < end) {
    out.push(...ordenesDelDia(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out.filter((o) => {
    const t = new Date(o.createdAt);
    return t >= start && t < end;
  });
}

module.exports = { CAMPANAS, PRODUCTOS, PROVINCIAS, PAGOS, ordenesDelDia, ordenesEntre, rng, semillaDe };
