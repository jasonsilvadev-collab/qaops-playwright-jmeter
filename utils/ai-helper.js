const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || "";
}

/** True when GEMINI_API_KEY is set (local .env or CI secret). */
function isGeminiConfigured() {
  return Boolean(getGeminiApiKey());
}

function getReqresApiKey() {
  const key = process.env.REQRES_API_KEY?.trim();
  return key || "";
}

/** Reqres passou a exigir header x-api-key (https://app.reqres.in/api-keys). */
function isReqresConfigured() {
  return Boolean(getReqresApiKey());
}

/** Cenários estáveis (documentação reqres.in) quando Gemini falha por quota (429). */
const CENARIOS_REGISTRO_FALLBACK = [
  {
    titulo: "[fallback] Registro válido (usuário demo)",
    email: "eve.holt@reqres.in",
    password: "pistol",
    statusCodeEsperado: 200,
  },
  {
    titulo: "[fallback] Senha ausente",
    email: "eve.holt@reqres.in",
    password: "",
    statusCodeEsperado: 400,
  },
  {
    titulo: "[fallback] Usuário não listado na demo",
    email: "sydney@fife",
    password: "pistol",
    statusCodeEsperado: 400,
  },
];

function cenariosRegistroFallbackCopia() {
  return CENARIOS_REGISTRO_FALLBACK.map((c) => ({ ...c }));
}

function createGenAI() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY ausente. Local: defina em .env. CI: Settings → Secrets → Actions → GEMINI_API_KEY (chave em https://aistudio.google.com/apikey)."
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

/** IDs válidos mudam no tempo; override opcional via GEMINI_MODEL. */
function getGeminiModelId() {
  const id = process.env.GEMINI_MODEL?.trim();
  return id || "gemini-2.0-flash";
}

function isGeminiQuotaOrRateLimitError(error) {
  if (!error) return false;
  const status = error.status ?? error.statusCode;
  if (status === 429 || status === 503) return true;
  const details = Array.isArray(error.errorDetails)
    ? JSON.stringify(error.errorDetails)
    : "";
  const text = `${error.message || ""} ${error.statusText || ""} ${details}`;
  // Free tier "limit: 0", quota metrics, 403 consumer suspended, etc.
  if (
    status === 403 &&
    /quota|rate|limit:\s*0|resource_exhausted|consumer|billing|permission/i.test(text)
  ) {
    return true;
  }
  return (
    /quota exceeded|exceeded your (current )?quota|limit:\s*0|free_tier|RESOURCE_EXHAUSTED|resource_exhausted|rate.?limit|generativelanguage\.googleapis\.com\/generate_content/i.test(
      text
    )
  );
}

function isGeminiStrict() {
  const v = process.env.GEMINI_STRICT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function gerarMassaDeDadosRegistro() {
  try {
    const genAI = createGenAI();
    const model = genAI.getGenerativeModel({ model: getGeminiModelId() });

    const prompt = `Você é um QA Engineer Sênior. Retorne APENAS um array JSON válido.
    Gere 3 cenários de teste de borda para uma API de Registro. A API exige e-mails válidos (ex: 'eve.holt@reqres.in'). 
    JSON exigido: 'titulo' (string), 'email' (string), 'password' (string, deixe vazia para forçar erro) e 'statusCodeEsperado' (number, 200 para sucesso, 400 para erro).`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Limpeza rigorosa para garantir que o JSON não venha quebrado
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
    
  } catch (error) {
    console.error("Falha ao consultar o Gemini:", error);
    throw error;
  }
}

/**
 * Sem GEMINI_API_KEY: só cenários fixos (smoke). Com Gemini: gera JSON; em quota/429/403
 * (ex.: free tier limit: 0) usa fallback. Ver https://ai.google.dev/gemini-api/docs/rate-limits
 * e billing. GEMINI_STRICT=1 faz estes erros propagarem (falha explícita no CI).
 */
async function obterCenariosRegistro() {
  if (!isGeminiConfigured()) {
    return cenariosRegistroFallbackCopia();
  }
  try {
    return await gerarMassaDeDadosRegistro();
  } catch (error) {
    if (!isGeminiStrict() && isGeminiQuotaOrRateLimitError(error)) {
      console.warn(
        "[Gemini] Quota / limite ou modelo indisponível no plano atual — usando CENARIOS_REGISTRO_FALLBACK. Ative faturação ou outro modelo (GEMINI_MODEL). GEMINI_STRICT=1 desliga o fallback."
      );
      return cenariosRegistroFallbackCopia();
    }
    throw error;
  }
}

module.exports = {
  gerarMassaDeDadosRegistro,
  obterCenariosRegistro,
  isGeminiConfigured,
  isReqresConfigured,
};