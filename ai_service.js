
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access API Key from environment or secure storage
const ENV_API_KEY = process.env.GEMINI_API_KEY || "";

async function generateTicketMessage(summary, clientName, userApiKey) {
    const API_KEY = userApiKey || ENV_API_KEY;

    console.log(`[AI Service] Generating message for summary: "${summary}" Client: "${clientName}"`);

    // 1. Fallback Template (If no key or error)
    const fallbackMessage = JSON.stringify({
        descricao: `Olá,\n\nO usuário ${clientName} relatou: ${summary}.\n\nSolicito verificação.\n\nAtenciosamente,\nBot Automatizado.`
    });

    if (!API_KEY) {
        console.warn("No API Key found. Returning fallback.");
        return fallbackMessage;
    }

    // 2. Real AI Call
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-flash-latest",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é "TomTicket", um especialista em Service Desk da empresa Hebron.
        Sua tarefa é criar uma DESCRIÇÃO TÉCNICA Concisa para um chamado, baseada EXCLUSIVAMENTE nas informações fornecidas.

        # ENTRADA
        Cliente: "${clientName}"
        Problema Relatado (Título): "${summary}"

        # REGRAS DE GERAÇÃO (IMPORTANTE)
        1. SEJA FACTUAL: Use APENAS a informação do Título. NÃO invente macros, formatação condicional, erros de rede ou detalhes que não existem no título.
        2. SEJA CONCISO: O texto deve ser curto e direto.
        3. FORMATO: "O usuário [Nome] solicita/relata [Problema]. [Breve complemento técnico genérico se necessário, sem inventar cenários complexos]."
        4. Exemplo Bom: "A usuária Haliny precisa de ajuda com Excel. Solicito suporte para verificação da formatação."
        5. Exemplo Ruim (NÃO FAZER): "A usuária Haliny está com erro de Macro VBScript no módulo 4 da planilha financeira devido a atualização do Windows." (Isso é alucinação).

        # FORMATO DE SAÍDA (JSON)
        Responda APENAS um objeto JSON com UM campo:
        {
          "descricao": "O texto completo do corpo do chamado"
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return cleanText;

    } catch (error) {
        console.error("AI Generation Error:", error);
        return fallbackMessage;
    }
}

async function generateSolutionMessage(title, description, clientName, userApiKey) {
    const API_KEY = userApiKey || ENV_API_KEY;

    // Fallback
    const fallbackMessage = JSON.stringify({
        solucao: `Chamado referente a "${title}" foi analisado e resolvido. Atenciosamente, Suporte.`
    });

    if (!API_KEY) return fallbackMessage;

    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-flash-latest",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é um assistente de Service Desk.
        Sua tarefa é escrever uma MENSAGEM DE ENCERRAMENTO (Solução) para um chamado técnico.

        # ENTRADA
        Cliente: "${clientName}"
        Título: "${title}"
        Descrição Original: "${description || title}"

        # REGRAS (RÍGIDAS)
        1. SEJA FACTUAL: Não invente procedimentos que não foram citados.
        2. FOCO NA SOLUÇÃO: Escreva como se o problema tivesse sido resolvido.
        3. PADRÃO: "Chamado finalizado. O problema relatado referente a [Título/Tema] foi tratado e resolvido com sucesso."
        4. NADA DE HISTÓRIAS: Não diga "Fui até o local", "Troquei o cabo", a menos que a descrição diga isso. Mantenha genérico e profissional.

        # SAÍDA (JSON)
        { "solucao": "Texto da solução..." }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text.replace(/```json/g, '').replace(/```/g, '').trim();

    } catch (error) {
        console.error("AI Solution Gen Error:", error);
        return fallbackMessage;
    }
}

module.exports = { generateTicketMessage, generateSolutionMessage };
