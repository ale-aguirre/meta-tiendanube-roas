'use strict';

const { postJson } = require('../lib/http');

const SECTIONS = ['DIAGNÓSTICO:', 'PROBLEMA PRINCIPAL:', 'CAUSAS:', 'ACCIONES URGENTES', 'OPORTUNIDAD:'];

/**
 * Análisis escrito, opcional, sobre los datos ya cruzados.
 *
 * Es lo único del dashboard que usa un LLM, y es opcional a propósito: las
 * reglas de la pestaña Resumen son deterministas y corren sin API key, sin
 * latencia y sin costo. Esto agrega una lectura en prosa, nada más.
 */
function createAiService({ config, cache }) {
  function isEnabled() {
    return Boolean(config.ai.enabled && config.ai.apiKey);
  }

  async function analyze({ metaData, tnData, datePreset }) {
    if (!isEnabled()) {
      const err = new Error('El análisis con IA no está configurado (falta OPENROUTER_API_KEY).');
      err.status = 503;
      throw err;
    }

    // Cache por contenido: los mismos datos de entrada devuelven la respuesta
    // guardada en vez de volver a pagar tokens.
    const key = 'analyze:' + hashInput({ metaData, tnData, datePreset, model: config.ai.model });

    return cache.wrap(key, async () => {
      const prompt = buildPrompt({ metaData, tnData, datePreset, business: config.business });

      const result = await postJson('https://openrouter.ai/api/v1/chat/completions', {
        model: config.ai.model,
        messages: [
          { role: 'system', content: 'Respondés siempre en español rioplatense. No mostrás tu razonamiento: devolvés únicamente el formato pedido.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: config.ai.maxTokens,
        temperature: 0.3,
      }, {
        headers: {
          Authorization: `Bearer ${config.ai.apiKey}`,
          'HTTP-Referer': config.business.siteUrl || 'http://localhost',
          'X-Title': `${config.business.name} Dashboard`,
        },
        timeout: 60000,
      });

      if (result.error) {
        const err = new Error(`OpenRouter: ${result.error.message || 'error desconocido'}`);
        err.status = 502;
        throw err;
      }

      const raw = result.choices?.[0]?.message?.content;
      if (!raw) {
        const err = new Error('OpenRouter no devolvió contenido. Revisá OPENROUTER_MODEL.');
        err.status = 502;
        throw err;
      }
      return { analysis: sanitize(raw), model: config.ai.model };
    });
  }

  return { isEnabled, analyze };
}

/**
 * Corta todo lo que venga antes de la primera sección pedida.
 *
 * Los modelos "de razonamiento" devuelven su cadena de pensamiento arriba de la
 * respuesta, a veces en inglés, y el dashboard la mostraba como si fuera el
 * análisis. Esto es determinista: si el formato está, se queda con el formato.
 */
function sanitize(text) {
  const clean = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const first = SECTIONS
    .map((s) => clean.indexOf(s))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  return first === undefined ? clean : clean.slice(first).trim();
}

function buildPrompt({ metaData = {}, tnData = {}, datePreset, business }) {
  const locale = business.locale;
  const money = (n) => `$${Math.round(n || 0).toLocaleString(locale)} ${business.currency}`;
  const roas = tnData.revenue && metaData.spend ? (tnData.revenue / metaData.spend).toFixed(2) : null;

  return `Sos un experto en e-commerce y marketing digital para ${business.type}.
Analizá los datos de ${business.name} para el período: ${datePreset || 'últimos 30 días'}.

DATOS META ADS:
- Gasto en ads: ${money(metaData.spend)}
- Compras atribuidas por Meta: ${metaData.purchases || 0}
- Impresiones: ${(metaData.impressions || 0).toLocaleString(locale)}
- CTR: ${(metaData.ctr || 0).toFixed(2)}%
- CPM: ${money(metaData.cpm)}
- CPA: ${metaData.cpa ? money(metaData.cpa) : 'sin ventas'}
- Frecuencia: ${(metaData.frequency || 0).toFixed(1)}x
- Agregaron al carrito: ${metaData.addToCart || 0}
- Iniciaron checkout: ${metaData.initiateCheckout || 0}

DATOS DE LA TIENDA (ventas efectivamente cobradas):
- Órdenes pagas: ${tnData.orders || 0}
- Revenue real: ${money(tnData.revenue)}
- Ticket promedio: ${money(tnData.avgTicket)}
- Carritos abandonados: ${tnData.abandonedCount || 0}
- Productos top: ${(tnData.topProducts || []).map((p) => `${p.name} (${p.qty} unid.)`).join(', ') || 'N/A'}
- ROAS real: ${roas ? `${roas}x` : 'N/A'}

Respondé con este formato exacto, en español rioplatense, sin asteriscos ni markdown:

DIAGNÓSTICO:
[2 oraciones máximo sobre qué está pasando realmente]

PROBLEMA PRINCIPAL:
[El problema #1 más urgente, con datos concretos]

CAUSAS:
1. [con número]
2. [con número]
3. [con número]

ACCIONES URGENTES (próximas 48hs):
1. [acción específica]
2. [acción específica]
3. [acción específica]

OPORTUNIDAD:
[Una oportunidad concreta justificada con datos]`;
}

function hashInput(value) {
  return require('crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

module.exports = { createAiService, buildPrompt, sanitize };
