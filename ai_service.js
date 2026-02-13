
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
        // Primary Model: Gemini 2.5 Flash (Confirmed Available)
        let model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é "TomTicket", um especialista em Service Desk da empresa Hebron.
        Sua tarefa é criar uma DESCRIÇÃO TÉCNICA Concisa para um chamado, baseada EXCLUSIVAMENTE nas informações fornecidas.

        # BASE DE CONHECIMENTO ESPECÍFICO (Hebronline)
        1. **Entidades**:
           - **Hebronline**: Sistema de visita médica.
           - **Usuários**: Propagandistas (PGs) ou setores (ex: 10.14.007).
           - **Contatos**: Médicos ou veterinários.
           - **PDV**: Pontos de Venda (Farmácias/Comércios), via CNPJ.
           - **V.A.**: Arquivo PDF (Portfólio de medicamentos).
           - **CRM**: Pode ser o software ou o registro médico (ex: CRM MG 12345).
        
        2. **Ações Comuns**:
           - **"Liberar contato"**: Significa "Ativar" um médico/veterinário desativado/cancelado.
           - **Internet Lenta**: Verificar portal de gestão (consumo de dados/bloqueio) antes de tudo.
           - **Certificados**: Fornecedor Certisign (A1=Software, A3=Hardware).

        # ENTRADA
        Cliente: "${clientName}"
        Problema Relatado (Título): "${summary}"

        # REGRAS DE GERAÇÃO (IMPORTANTE)
        1. **FACTUALIDADE**: Use a Base de Conhecimento. Se o usuário diz "liberar contato", é para ATIVAR. Se fala de "internet", mencione verificação de dados/portal se aplicável.
        2. **CONCISÃO**: Texto curto e direto.
        3. **FORMATO**: "O usuário [Nome] solicita/relata [Problema]. [Procedimento técnico sugerido/realizado]."
        4. **Exemplos**:
           - "A usuária Haliny solicita liberação do contato CRM 12345. Solicitado ativação no sistema."
           - "O PG 10.14.007 relata lentidão no tablet. Necessário verificar consumo de dados no portal de gestão."

        # FORMATO DE SAÍDA (JSON)
        Responda APENAS um objeto JSON com UM campo:
        {
          "descricao": "O texto completo do corpo do chamado"
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Check if response is valid/JSON
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return cleanText;

    } catch (error) {
        const errStr = error.toString();

        // Fallback Logic: If 404 (Not Found), try the old reliable "gemini-flash-latest"
        if (errStr.includes('404') || errStr.includes('Not Found')) {
            console.warn("⚠️ Primary (Flash-001) not found. Fallback to 'gemini-flash-latest' (Original Slow but Working)...");

            try {
                const genAI = new GoogleGenerativeAI(API_KEY);
                const model = genAI.getGenerativeModel({
                    model: "gemini-flash-latest", // This is the one that worked initially (slowly)
                    generationConfig: { responseMimeType: "application/json" }
                });

                const prompt = `
                Você é "TomTicket", um especialista em Service Desk da empresa Hebron.
                Sua tarefa é criar uma DESCRIÇÃO TÉCNICA Concisa para um chamado.
                
                # BASE DE CONHECIMENTO ESPECÍFICO
                - **Liberar contato** = Ativar médico desativado.
                - **Internet Lenta** = Verificar consumo/portal de gestão.
                - **PDV** = Ponto de Venda (CNPJ).
                - **V.A.** = PDF/Portfólio.

                # ENTRADA
                Cliente: "${clientName}"
                Problema: "${summary}"
                
                # FORMATO
                "O usuário [Nome] solicita/relata [Problema]. [Ação técnica baseada no conhecimento]."

                # SAÍDA (JSON)
                { "descricao": "Texto da descrição..." }
                `;

                const result = await model.generateContent(prompt);
                const response = await result.response;
                return response.text().replace(/```json/g, '').replace(/```/g, '').trim();

            } catch (fallbackError) {
                console.error("Fallback failed:", fallbackError);
                throw fallbackError;
            }
        }

        console.error("AI Generation Error:", error);
        throw error;
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
        // Primary Model: Gemini 2.5 Flash
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Você é um assistente de Service Desk, especialista no sistema Hebronline.
        Sua tarefa é escrever uma MENSAGEM DE ENCERRAMENTO (Solução) para um chamado técnico, de forma NATURAL e PROFISSIONAL.

        # CONTEXTO (Hebronline)
        - PGs: Propagandistas.
        - PDV (Ponto de Venda): Estabelecimentos comerciais (CNPJ).
        - V.A.: Arquivo PDF (Portfólio de medicamentos).
        - CRM: Pode ser o sistema ou o registro médico (ex: CRM MG 12345).
        - "Liberar contato": Significa "Ativar" um médico/veterinário desativado.
        - Internet Lenta: Verificar portal de gestão (consumo de dados).

        # ENTRADA
        Cliente: "${clientName}"
        Título: "${title}"
        Descrição Original: "${description || title}"

        # REGRAS RÍGIDAS (Atualizadas)
        1. NATURALIDADE: Não use "Chamado finalizado." no início. Comece direto com a ação realizada.
        2. FACTUALIDADE: O problema FOI resolvido. Afirme isso.
        3. FORMATO: "O problema relatado referente a [Título/Tema Ajustado] foi tratado e resolvido com sucesso." ou variações naturais como "Realizado o procedimento de [Ação] para o [Cliente/Setor], resolvendo a solicitação."
        4. EXEMPLOS BONS:
           - "O problema relatado referente ao Adobe Illustrator 26 foi tratado e resolvido com sucesso."
           - "O problema relatado referente a transferência de contatos da Bahia do setor 20.15 foi tratado e resolvido com sucesso."
           - "A solicitação de liberação do contato CRM 12345 foi processada e o médico está ativo novamente."
        5. EXEMPLOS RUINS (NÃO FAZER):
           - "Chamado finalizado. O problema..." (NÃO comece com Chamado finalizado).
           - Texto robótico ou repetitivo demais.

        # SAÍDA (JSON)
        { "solucao": "Texto da solução..." }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text.replace(/```json/g, '').replace(/```/g, '').trim();

    } catch (error) {
        const errStr = error.toString();
        if (errStr.includes('404') || errStr.includes('Not Found')) {
            console.warn("⚠️ Solution: Flash-001 model not found. Fallback to 'gemini-flash-latest'...");
            try {
                const genAI = new GoogleGenerativeAI(API_KEY);
                const model = genAI.getGenerativeModel({
                    model: "gemini-flash-latest",
                    generationConfig: { responseMimeType: "application/json" }
                });
                // Re-prompt
                const prompt = `
                Você é um assistente de Service Desk, especialista no sistema Hebronline.
                Sua tarefa é escrever uma SOLUÇÃO concisa.
                # ENTRADA
                Cliente: "${clientName}"
                Título: "${title}"
                # SAÍDA (JSON)
                { "solucao": "O problema referente a ${title} foi resolvido." }
                `;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                return response.text().replace(/```json/g, '').replace(/```/g, '').trim();

            } catch (fbError) {
                console.error("Solution Fallback Error:", fbError);
                throw fbError;
            }
        }
        console.error("AI Solution Gen Error:", error);
        throw error;
    }
}

module.exports = { generateTicketMessage, generateSolutionMessage };
