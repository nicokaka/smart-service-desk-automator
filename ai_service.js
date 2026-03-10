const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access API Key from environment or secure storage
const ENV_API_KEY = process.env.GEMINI_API_KEY || "";

// --- Cached Model Instances (Reuse across calls) ---
let _modelCache = {};

function getModel(apiKey, modelName = "gemini-2.5-flash", useFallback = false) {
  const targetModel = useFallback ? "gemini-flash-latest" : modelName;
  const cacheKey = `${apiKey}_${targetModel}`;

  if (!_modelCache[cacheKey]) {
    const genAI = new GoogleGenerativeAI(apiKey);
    _modelCache[cacheKey] = genAI.getGenerativeModel({
      model: targetModel,
      generationConfig: { responseMimeType: "application/json" },
    });
    console.log(
      `[AI Service] Model instance created (cached) for: ${targetModel}`,
    );
  }
  return _modelCache[cacheKey];
}

function cleanResponse(text) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

async function generateTicketMessage(
  summary,
  clientName,
  userApiKey,
  customPrompt,
  activeModel,
) {
  const API_KEY = userApiKey || ENV_API_KEY;

  console.log(
    `[AI Service] Generating message for: "${summary}" | Client: "${clientName}" | Model: "${activeModel || "gemini-2.5-flash"}"`,
  );

  const fallbackMessage = JSON.stringify({
    descricao: `Olá,\n\nO usuário ${clientName} relatou: ${summary}.\n\nSolicito verificação.\n\nAtenciosamente,\nBot Automatizado.`,
  });

  if (!API_KEY) {
    console.warn("No API Key found. Returning fallback.");
    return fallbackMessage;
  }

  const defaultHebronContext = `Contexto de Domínio e Infraestrutura:
- Hebronline: Sistema de visita médica. 
- Usuários: Propagandistas (PGs) ou setores.
- Contatos: Médicos ou veterinários. 
- Ações e Status: "Liberar contato" sempre significa Ativar um contato desativado. Use apenas os termos "ativo" ou "desativado".
- Termos Comerciais: PDV = Ponto de Venda (identificado via CNPJ). V.A. = Arquivo PDF com portfólio de medicamentos.
- CRM: Pode ser o Sistema de Gestão ou o Registro Profissional (ex: CRM MG 12345).
- Internet Móvel/Chips: Em caso de lentidão/falha, a primeira ação é sempre verificar o portal de gestão (consumo de franquia ou bloqueios).
- Certificados Digitais: Fornecedor Certisign. A1 (Software), A3 (Hardware). "Configurar" geralmente significa corrigir erros, não apenas instalar.
- Formatação Obrigatória: Nomes, CRMs, CNPJs e linhas devem estar em **negrito**. Códigos numéricos de setor devem estar em negrito e entre cifrões (ex: **$10.14.007$\`).`;

  const appliedContext =
    customPrompt && customPrompt.trim() !== ""
      ? customPrompt
      : defaultHebronContext;

  const prompt = `Você é um especialista em Service Desk aplicando as regras de negócio listadas abaixo.
Crie uma DESCRIÇÃO TÉCNICA concisa para o chamado abaixo.

# Regras e Contexto:
${appliedContext}

# Entrada
  Cliente: "${clientName}"
  Problema: "${summary}"

# Formato
  "O usuário [Nome] solicita/relata [Problema]. [Ação técnica sugerida]."

# Saída(JSON)
  { "descricao": "Texto da descrição" } `;

  try {
    const model = getModel(API_KEY, activeModel);
    const result = await model.generateContent(prompt);
    return cleanResponse(result.response.text());
  } catch (error) {
    const errStr = error.toString();

    if (errStr.includes("404") || errStr.includes("Not Found")) {
      console.warn(
        "⚠️ Primary model not found. Fallback to 'gemini-flash-latest'...",
      );
      try {
        const fallbackModel = getModel(API_KEY, activeModel, true);
        const result = await fallbackModel.generateContent(prompt);
        return cleanResponse(result.response.text());
      } catch (fallbackError) {
        console.error("Fallback failed:", fallbackError);
        throw fallbackError;
      }
    }

    console.error("AI Generation Error:", error);
    throw error;
  }
}

async function generateSolutionMessage(
  title,
  description,
  clientName,
  userApiKey,
  customPrompt,
  activeModel,
) {
  const API_KEY = userApiKey || ENV_API_KEY;

  const fallbackMessage = JSON.stringify({
    solucao: `Chamado referente a "${title}" foi analisado e resolvido.Atenciosamente, Suporte.`,
  });

  if (!API_KEY) return fallbackMessage;

  const defaultHebronContext = `- PGs: Propagandistas.PDV: Ponto de Venda.V.A.: PDF / Portfólio
    - "Liberar contato" = Ativar médico / veterinário desativado
      - CRM = Software ou registro médico`;

  const appliedContext =
    customPrompt && customPrompt.trim() !== ""
      ? customPrompt
      : defaultHebronContext;

  const prompt = `Escreva uma mensagem de encerramento(solução) concisa e profissional para um chamado de Service Desk.

# Regras e Contexto:
${appliedContext}

# Entrada
  Cliente: "${clientName}"
  Título: "${title}"
  Descrição: "${description || title}"

# Regras para a Mensagem de Finalização:
  - Objetivo: Criar uma mensagem concisa confirmando que a tarefa foi concluída ou o problema foi resolvido, e que a solução foi validada.
- Anonimato do Solicitante: Use APENAS termos genéricos como "o cliente" ou "o usuário".NUNCA escreva o nome da pessoa nesta mensagem.
- Palavras Proibidas: NUNCA inclua a frase "Chamado finalizado." no texto(pois isso já é um status do sistema).
  - Formatação Obrigatória: Mantenha identificadores(CRMs, CNPJs) em ** negrito ** e códigos de setor como ** $10.14.002$ **, caso precise mencioná - los.
- Tom: Direto, técnico e em português do Brasil.

# Saída(JSON)
  { "solucao": "Texto da solução" } `;

  try {
    const model = getModel(API_KEY, activeModel);
    const result = await model.generateContent(prompt);
    return cleanResponse(result.response.text());
  } catch (error) {
    const errStr = error.toString();

    if (errStr.includes("404") || errStr.includes("Not Found")) {
      console.warn(
        "⚠️ Solution: Model not found. Fallback to 'gemini-flash-latest'...",
      );
      try {
        const fallbackModel = getModel(API_KEY, activeModel, true);
        const result = await fallbackModel.generateContent(prompt);
        return cleanResponse(result.response.text());
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
