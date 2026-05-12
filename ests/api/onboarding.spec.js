const { test, expect } = require('@playwright/test');
const { obterCenariosRegistro, isGeminiConfigured } = require('../../utils/ai-helper');

test.describe('API - Fluxo de Registro guiado por Google Gemini', () => {

  test('Deve testar dinamicamente os cenários de IA na API reqres.in', async ({ request }) => {
    test.skip(
      !isGeminiConfigured(),
      'GEMINI_API_KEY não definida: defina no .env ou no secret GEMINI_API_KEY no GitHub Actions (403 sem chave).'
    );

    // 1. IA gera cenários; em 429 (quota) usa fallback estável (ver utils/ai-helper.js)
    const cenariosGerados = await obterCenariosRegistro();
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