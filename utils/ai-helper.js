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

function isGeminiQuotaOrRateLimitError(error) {
  if (!error) return false;
  if (error.status === 429 || error.statusCode === 429) return true;
  const text = `${error.message || ""} ${error.statusText || ""}`;
  return /429|quota exceeded|rate.?limit|resource_exhausted/i.test(text);
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
 * Tenta gerar cenários com Gemini; em quota/rate limit (429) devolve cenários fixos
 * para o pipeline não falhar (ver https://ai.google.dev/gemini-api/docs/rate-limits ).
 * Com GEMINI_STRICT=1, 429 propaga erro (CI falha até haver quota).
 */
async function obterCenariosRegistro() {
  try {
    return await gerarMassaDeDadosRegistro();
  } catch (error) {
    if (!isGeminiStrict() && isGeminiQuotaOrRateLimitError(error)) {
      console.warn(
        "[Gemini] Quota ou limite de taxa; usando CENARIOS_REGISTRO_FALLBACK. Defina GEMINI_STRICT=1 para falhar em 429."
      );
      return CENARIOS_REGISTRO_FALLBACK;
    }
    throw error;
  }
}

module.exports = {
  gerarMassaDeDadosRegistro,
  obterCenariosRegistro,
  isGeminiConfigured,
};