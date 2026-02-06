
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access API Key from environment or secure storage
const ENV_API_KEY = process.env.GEMINI_API_KEY || "";

async function generateTicketMessage(summary, userApiKey) {
    const API_KEY = userApiKey || ENV_API_KEY;

    console.log(`[AI Service] Generating message for summary: "${summary}" (Key provided: ${!!userApiKey})`);

    // 1. Fallback Template (If no key or error)
    // Return valid JSON string for fallback to maintain contract
    const fallbackMessage = JSON.stringify({
        assunto: "Falha Relatada (Sem IA)",
        descricao: `Olá,\n\nGostaria de relatar o seguinte problema: ${summary}.\n\nSolicito verificação.\n\nAtenciosamente,\nBot Automatizado.`
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
            generationConfig: { responseMimeType: "application/json" } // Force JSON if supported, otherwise prompt handles it
        });

        const prompt = `
        Você é "TomTicket", um especialista em Service Desk da empresa Hebron.
        Sua tarefa é transformar solicitações curtas e informais em textos técnicos profissionais para abertura de chamados.

        # REGRAS DE NEGÓCIO
        1. Cenário Ação (Ex: "Instalar Java"): 
           - Assunto: Verbo no infinitivo + Objeto.
           - Mensagem: Solicitação direta. Destaque nomes e ativos em negrito (**texto**).
        2. Cenário Problema (Ex: "Impressora parou"):
           - Assunto: Descrição do erro ou sintoma.
           - Mensagem: Relato técnico do sintoma reportado pelo usuário.
        3. Formatação:
           - Use Markdown apenas para negrito (**).
           - Setores devem estar entre cifrões e negrito (ex: **$10.14.002$**).

        # FORMATO DE SAÍDA (JSON)
        Responda APENAS um objeto JSON com dois campos:
        {
          "assunto": "Um título curto e profissional para a lista de chamados",
          "descricao": "O texto completo e formatado para o corpo do chamado"
        }

        Entrada do Usuário: "${summary}"
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Ensure strictly JSON
        // Clean markdown code blocks if any (e.g., ```json ... ```)
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return cleanText;

    } catch (error) {
        console.error("AI Generation Error:", error);
        return fallbackMessage;
    }
}

module.exports = { generateTicketMessage };
