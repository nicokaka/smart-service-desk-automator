
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access API Key from environment or secure storage
// For now using a placeholder or a free key if user provides one.
// You can replace this with your actual key.
const API_KEY = process.env.GEMINI_API_KEY || "";

async function generateTicketMessage(summary) {
    console.log(`[AI Service] Generating message for summary: "${summary}"`);

    // 1. Fallback Template (If no key or error)
    // This ensures the user always gets a result even without an API key.
    const fallbackMessage = `[IA Template]
Olá, bom dia.

Gostaria de relatar o seguinte problema: ${summary}.

Detalhamento:
- O problema ocorre intermitentemente.
- Afeta o trabalho do usuário.
- Já realizamos testes básicos (reinicialização).

Solicito verificação.

Atenciosamente,
Bot Automatizado.`;

    if (!API_KEY) {
        return fallbackMessage;
    }

    // 2. Real AI Call
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
        Aja como um técnico de TI experiente. Escreva uma mensagem para abertura de chamado técnico baseada neste resumo: "${summary}".
        
        Regras:
        - Seja formal e polido.
        - Estruture com: Saudação, Descrição do Problema, Impacto, Tentativas de Solução (básicas), Solicitação.
        - Não invente dados específicos que não estão no resumo.
        - Assine como "Colaborador".
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("AI Generation Error:", error);
        return fallbackMessage;
    }
}

module.exports = { generateTicketMessage };
