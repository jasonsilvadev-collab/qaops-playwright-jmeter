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

module.exports = { gerarMassaDeDadosRegistro, isGeminiConfigured };