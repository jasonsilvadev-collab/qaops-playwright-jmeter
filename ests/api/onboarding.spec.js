const { test, expect } = require('@playwright/test');
const { obterCenariosRegistro, isGeminiConfigured, isReqresConfigured } = require('../../utils/ai-helper');

const REQRES_REGISTER_URL = 'https://reqres.in/api/register';

/**
 * ReqRes limita taxa (429). Re-tenta com backoff + Retry-After quando existir.
 */
async function postRegisterComRetry(request, data, { maxAttempts = 6 } = {}) {
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
    const retryAfter = response.headers()['retry-after'];
    const parsedRa = parseInt(retryAfter, 10);
    const waitMs = retryAfter && !Number.isNaN(parsedRa)
      ? Math.max(1000, parsedRa * 1000)
      : Math.min(12_000, 600 * 2 ** i);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return last;
}

test.describe('API - Fluxo de Registro guiado por Google Gemini', () => {

  test('Deve testar dinamicamente os cenários de IA na API reqres.in', async ({ request }) => {
    test.setTimeout(120_000);
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

    // 2. Itera sobre cada cenário e ataca a API (espaçamento reduz rajadas → menos 429)
    for (let idx = 0; idx < cenariosGerados.length; idx++) {
      const cenario = cenariosGerados[idx];
      if (idx > 0) {
        await new Promise((r) => setTimeout(r, 400));
      }
      console.log(`\nTestando cenário IA: ${cenario.titulo}`);

      const { response, body: responseBody } = await postRegisterComRetry(request, {
        email: cenario.email,
        password: cenario.password,
      });

      // 3. Validações Sênior (Status e Corpo)
      expect(response.status()).toBe(cenario.statusCodeEsperado);

      if (cenario.statusCodeEsperado === 200) {
        expect(responseBody).toHaveProperty('token');
      } else if (cenario.statusCodeEsperado === 400) {
        expect(responseBody).toHaveProperty('error');
      }
    }
  });

});