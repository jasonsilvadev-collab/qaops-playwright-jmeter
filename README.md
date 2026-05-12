# QAOps — Playwright, JMeter e Google Gemini

Repositório de automação de QA que combina **testes de API com Playwright**, **cenários gerados (ou não) pelo Google Gemini** e **teste de carga com Apache JMeter**, contra a API pública de demonstração **ReqRes** (`https://reqres.in`).

---

## Pré-requisitos

- **Node.js 18+** (alinhado ao CI em `.github/workflows/pipeline.yml`)
- **npm**
- Conta/chave na **ReqRes** (obrigatório para chamar `/api/*`): [criar API key](https://app.reqres.in/api-keys)
- (Opcional) Chave **Google Gemini** para gerar massa de dados de teste: [Google AI Studio](https://aistudio.google.com/apikey)
- (Opcional, só para carga local) **Apache JMeter** instalado no sistema

---

## Como rodar localmente

### 1. Clonar e instalar dependências

```bash
git clone <url-do-repositório>
cd qaops-playwright-jmeter
npm ci
```

Os testes atuais usam apenas a **API HTTP** do Playwright (`request`), **sem browser**. Para não baixar Chromium/webkit, podes usar:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
```

### 2. Variáveis de ambiente

Cria um ficheiro **`.env`** na raiz (este ficheiro está no `.gitignore` e **não** deve ser commitado):

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `REQRES_API_KEY` | **Sim** | Chave ReqRes; o Playwright envia o header `x-api-key` em todos os pedidos (ver `playwright.config.js`). |
| `GEMINI_API_KEY` | Não | Se existir, o Gemini gera JSON com cenários de teste; se faltar ou houver quota, usam-se cenários fixos (ver abaixo). |
| `GEMINI_MODEL` | Não | ID do modelo (por defeito `gemini-2.0-flash`). |
| `GEMINI_STRICT` | Não | Se `1` / `true`, erros de quota do Gemini **não** usam fallback — o teste falha. |

Exemplo mínimo:

```env
REQRES_API_KEY=a_tua_chave_reqres
```

Com IA opcional:

```env
REQRES_API_KEY=a_tua_chave_reqres
GEMINI_API_KEY=a_tua_chave_gemini
```

### 3. Executar os testes Playwright

```bash
npx playwright test
```

Ou, após `npm ci`:

```bash
npm test
```

Listar testes sem executar:

```bash
npx playwright test --list
```

### 4. (Opcional) JMeter em local

O plano JMeter está em `performance/load-test.jmx`. Parâmetros por linha de comando (`-J`):

- `threads`, `loops`, `ramp` — valores por defeito no `.jmx` se não passares `-J`
- `reqresApiKey` — **obrigatório** para ReqRes aceitar os pedidos

Exemplo:

```bash
jmeter -n -t performance/load-test.jmx -l performance/results.jtl \
  -Jthreads=5 -Jloops=2 -Jramp=10 \
  -JreqresApiKey="SUA_REQRES_API_KEY"
```

---

## Como o projeto funciona

### Estrutura principal

| Pasta / ficheiro | Função |
|------------------|--------|
| `ests/api/onboarding.spec.js` | Teste de API: obtém cenários (Gemini ou fallback), faz `POST /api/register` no ReqRes e valida status e corpo (`token` ou `error`). Inclui retries e pausas para mitigar **429** (rate limit) do ReqRes. |
| `utils/ai-helper.js` | Cliente Gemini (`@google/generative-ai`), prompt para gerar JSON de cenários, **cenários fixos** quando não há chave Gemini, em **quota/rate limit**, ou quando queres smoke sem IA. |
| `performance/load-test.jmx` | Plano JMeter: utilizadores virtuais a registar no mesmo endpoint; headers `Content-Type` e `x-api-key` via propriedade `reqresApiKey`. |
| `playwright.config.js` | `testDir: ./ests`, carrega `.env`, injeta `x-api-key` global nos pedidos quando `REQRES_API_KEY` está definida. |
| `.github/workflows/pipeline.yml` | CI no **push** à branch `main`: job Playwright → job JMeter (em sequência para reduzir 429 na mesma chave). |

### Fluxo do teste Playwright

1. **ReqRes** — Se `REQRES_API_KEY` estiver vazia, o teste é **ignorado** (`test.skip`) com mensagem a indicar onde criar a chave.
2. **Cenários** — `obterCenariosRegistro()` em `ai-helper.js`:
   - Sem `GEMINI_API_KEY`: devolve sempre os **cenários fixos** (smoke).
   - Com chave: chama o Gemini; se o erro for de **quota / limite** (e `GEMINI_STRICT` não estiver ativo), volta aos cenários fixos.
3. **Execução** — Para cada cenário, `POST https://reqres.in/api/register` com `email` e `password`; compara o status HTTP esperado e valida `token` (200) ou `error` (400).

### CI (GitHub Actions)

No repositório GitHub, define **Secrets → Actions**:

- **`REQRES_API_KEY`** — obrigatório para Playwright e JMeter.
- **`GEMINI_API_KEY`** — opcional; sem ele o fluxo usa só cenários fixos no teste de API.

O job **JMeter** corre **depois** do Playwright e usa carga mínima no CI (`1` thread, `1` loop, `ramp` 15s) para não esgotar o rate limit do ReqRes. O ficheiro `.jtl` é publicado como **artefacto** `jmeter-results`.

---

## Resolução de problemas

| Sintoma | O que verificar |
|---------|------------------|
| **401** no ReqRes | `REQRES_API_KEY` ausente ou inválida; header `x-api-key` é obrigatório nas rotas `/api/*`. |
| **429** no ReqRes | Rate limit da chave; o teste já faz retries e esperas. Evita correr JMeter pesado em paralelo com os mesmos endpoints. |
| **Quota / limit: 0** no Gemini | Plano ou modelo sem quota no projeto Google; o código pode cair em **cenários fixos** (exceto com `GEMINI_STRICT=1`). |
| Playwright pede browsers | Estes testes são só API; usa `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` no `npm ci` se quiseres evitar download de browsers. |

---

## Licença

ISC (ver `package.json`).
