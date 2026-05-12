const { test, expect } = require('@playwright/test');
const { obterCenariosRegistro, isGeminiConfigured, isReqresConfigured } = require('../../utils/ai-helper');

const REQRES_REGISTER_URL = 'https://reqres.in/api/register';

/** Extrai "Please retry in 58.3s" (ou similar) do JSON/corpo ReqRes/Google-style. */
function extrairRetryMsDeCorpo429(body) {
  const blob =
    typeof body === "object" && body !== null
      ? JSON.stringify(body)
      : String(body ?? "");
  const m = blob.match(/retry in ([\d.]+)\s*s/i);
  if (!m) return null;
  const sec = parseFloat(m[1], 10);
  if (Number.isNaN(sec)) return null;
  return Math.ceil(sec * 1000) + 2500;
}

/**
 * ReqRes devolve 429 com janela longa (~60s). Backoff curto não chega: usa Retry-After,
 * texto no corpo, ou espera fixa longa nas últimas tentativas.
 */
async function postRegisterComRetry(request, data, { maxAttempts = 10 } = {}) {
  let last = { response: null, body: {} };
  for (let i = 0; i < maxAttempts; i++) {
    const response = await request.post(REQRES_REGISTER_URL, { data });
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    last = { response, body };
    if (response.status() !== 429) {
      return last;
    }
    if (i === maxAttempts - 1) {
      break;
    }
    const headerRa = response.headers()["retry-after"];
    const headerSec = headerRa ? parseFloat(headerRa, 10) : NaN;
    const fromHeader =
      !Number.isNaN(headerSec) && headerSec > 0
        ? Math.max(2000, Math.ceil(headerSec * 1000))
        : null;
    const fromBody = extrairRetryMsDeCorpo429(body);
    const exponential = Math.min(90_000, 4000 * 2 ** i);
    const longFallback = i >= 2 ? 66_000 : exponential;
    const waitMs = Math.min(
      120_000,
      Math.max(fromHeader ?? 0, fromBody ?? 0, longFallback)
    );
    console.warn(
      `[ReqRes] 429 tentativa ${i + 1}/${maxAttempts}; aguardar ${waitMs}ms antes de repetir.`
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return last;
}

test.describe('API - Fluxo de Registro guiado por Google Gemini', () => {
  test.describe.configure({ retries: process.env.CI ? 1 : 0 });

  test('Deve testar dinamicamente os cenários de IA na API reqres.in', async ({ request }) => {
    test.setTimeout(600_000);
    test.skip(
      !isReqresConfigured(),
      'REQRES_API_KEY ausente: a API pública exige x-api-key. Crie em https://app.reqres.in/api-keys e defina no .env ou secret REQRES_API_KEY no GitHub Actions.'
    );

    // 1. Com GEMINI_API_KEY: IA gera cenários; sem Gemini ou em 429: fallback (utils/ai-helper.js)
    const cenariosGerados = await obterCenariosRegistro();
    if (!isGeminiConfigured()) {
      console.log('\n[INFO] Sem GEMINI_API_KEY — a executar cenários fixos (smoke).');
    }
    expect(cenariosGerados.length).toBeGreaterThan(0);

    // Pausa após Gemini + antes do primeiro POST (reduz 429 em sequência com a geração).
    await new Promise((r) => setTimeout(r, 5000));

    // 2. Itera sobre cada cenário e ataca a API
    for (let idx = 0; idx < cenariosGerados.length; idx++) {
      const cenario = cenariosGerados[idx];
      if (idx > 0) {
        await new Promise((r) => setTimeout(r, 3500));
      }
      console.log(`\nTestando cenário IA: ${cenario.titulo}`);

      const { response, body: responseBody } = await postRegisterComRetry(request, {
        email: cenario.email,
        password: cenario.password,
      });

      // 3. Validações Sênior (Status e Corpo)
      expect(response.status(), `status inesperado (último corpo: ${JSON.stringify(responseBody).slice(0, 400)})`).toBe(
        cenario.statusCodeEsperado
      );

      if (cenario.statusCodeEsperado === 200) {
        expect(responseBody).toHaveProperty('token');
      } else if (cenario.statusCodeEsperado === 400) {
        expect(responseBody).toHaveProperty('error');
      }
    }
  });

});