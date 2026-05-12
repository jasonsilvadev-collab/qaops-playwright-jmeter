const { test, expect } = require('@playwright/test');
const { obterCenariosRegistro, isGeminiConfigured, isReqresConfigured } = require('../../utils/ai-helper');

test.describe('API - Fluxo de Registro guiado por Google Gemini', () => {

  test('Deve testar dinamicamente os cenários de IA na API reqres.in', async ({ request }) => {
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

    // 2. Itera sobre cada cenário e ataca a API
    for (const cenario of cenariosGerados) {
      console.log(`\nTestando cenário IA: ${cenario.titulo}`);

      const response = await request.post('https://reqres.in/api/register', {
        data: {
          email: cenario.email,
          password: cenario.password
        }
      });

      const responseBody = await response.json();

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