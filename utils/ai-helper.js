const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function gerarMassaDeDadosRegistro() {
  try {
    // Usamos o modelo flash-latest para evitar o erro 404
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

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

module.exports = { gerarMassaDeDadosRegistro };