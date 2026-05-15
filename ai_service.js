"use strict";

const { GoogleGenerativeAI } = require("@google/generative-ai");

// API key from environment (only used as last resort — renderer always passes the key explicitly)
const ENV_API_KEY = process.env.GEMINI_API_KEY || "";

// ─── Model cache (max 8 entries — LRU) ───────────────────────────────────────

const MODEL_CACHE_MAX = 8;

/** @type {Map<string, object>} — key → model instance, insertion-order LRU */
const _modelCache = new Map();

/**
 * Get (or create and cache) a Gemini model instance.
 * Uses LRU eviction once the cache exceeds MODEL_CACHE_MAX entries.
 *
 * @param {string} apiKey
 * @param {string} [modelName]
 * @param {boolean} [useFallback]
 */
function getModel(apiKey, modelName = "gemini-2.5-flash", useFallback = false) {
  const targetModel = useFallback ? "gemini-flash-latest" : modelName;
  const cacheKey = `${apiKey}::${targetModel}`;

  if (_modelCache.has(cacheKey)) {
    // Refresh LRU position: delete + re-insert
    const cached = _modelCache.get(cacheKey);
    _modelCache.delete(cacheKey);
    _modelCache.set(cacheKey, cached);
    return cached;
  }

  // Evict oldest entry if at capacity
  if (_modelCache.size >= MODEL_CACHE_MAX) {
    const oldestKey = _modelCache.keys().next().value;
    _modelCache.delete(oldestKey);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: targetModel,
    generationConfig: { responseMimeType: "application/json" },
  });

  _modelCache.set(cacheKey, model);
  console.log(`[AI Service] Model cached: ${targetModel} (cache size: ${_modelCache.size})`);
  return model;
}

/** Exposed for testing only — clears the entire model cache. */
function _clearModelCache() {
  _modelCache.clear();
}

// ─── Response cleanup ─────────────────────────────────────────────────────────

function cleanResponse(text) {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Default prompt context ───────────────────────────────────────────────────

/**
 * Generic service desk context.
 * Companies with specific domain knowledge should use the `customPrompt`
 * setting in the app — this is intentionally generic so the tool works
 * out of the box for any team.
 */
const DEFAULT_SERVICE_DESK_CONTEXT = `Contexto: Suporte técnico de TI generalista.
- Usuários finais de diferentes departamentos.
- Foco em comunicação clara, objetiva e profissional em português do Brasil.
- Evite jargões internos ou referências específicas a sistemas proprietários.`;

// ─── Generate ticket description ──────────────────────────────────────────────

/**
 * @param {string} summary     Raw one-liner from the attendant
 * @param {string} clientName  Customer name
 * @param {string} userApiKey  Gemini API key from settings
 * @param {string} customPrompt Company-specific context (optional)
 * @param {string} activeModel  Gemini model identifier
 * @returns {Promise<string>}   JSON string: { "descricao": "..." }
 */
async function generateTicketMessage(
  summary,
  clientName,
  userApiKey,
  customPrompt,
  activeModel,
) {
  const apiKey = userApiKey || ENV_API_KEY;
  const model = activeModel || "gemini-2.5-flash";

  console.log(
    `[AI Service] generateTicketMessage | model=${model} | client="${clientName}"`,
  );

  const fallback = JSON.stringify({
    descricao: `Olá,\n\nO usuário ${clientName} relatou: ${summary}.\n\nSolicito verificação.\n\nAtenciosamente,\nBot Automatizado.`,
  });

  if (!apiKey) {
    console.warn("[AI Service] No API key — returning fallback message.");
    return fallback;
  }

  const context =
    customPrompt && customPrompt.trim() !== ""
      ? customPrompt.trim()
      : DEFAULT_SERVICE_DESK_CONTEXT;

  const prompt = `Você é um especialista em Service Desk aplicando as regras de negócio listadas abaixo.
Crie uma DESCRIÇÃO TÉCNICA concisa para o chamado abaixo.

# Regras e Contexto:
${context}

# Entrada
  Cliente: "${clientName}"
  Problema: "${summary}"

# Formato
  "O usuário [Nome] solicita/relata [Problema]. [Ação técnica sugerida]."

# Saída (JSON)
  { "descricao": "Texto da descrição" }`;

  return callWithFallback(apiKey, model, prompt, fallback);
}

// ─── Generate solution / closing message ──────────────────────────────────────

/**
 * @param {string} title        Ticket subject
 * @param {string} description  Ticket description (may equal title if absent)
 * @param {string} clientName   Customer name
 * @param {string} userApiKey   Gemini API key from settings
 * @param {string} customPrompt Company-specific context (optional)
 * @param {string} activeModel  Gemini model identifier
 * @returns {Promise<string>}   JSON string: { "solucao": "..." }
 */
async function generateSolutionMessage(
  title,
  description,
  clientName,
  userApiKey,
  customPrompt,
  activeModel,
) {
  const apiKey = userApiKey || ENV_API_KEY;
  const model = activeModel || "gemini-2.5-flash";

  const fallback = JSON.stringify({
    solucao: `Chamado referente a "${title}" foi analisado e resolvido. Atenciosamente, Suporte.`,
  });

  if (!apiKey) {
    return fallback;
  }

  const context =
    customPrompt && customPrompt.trim() !== ""
      ? customPrompt.trim()
      : DEFAULT_SERVICE_DESK_CONTEXT;

  const prompt = `Escreva uma mensagem de encerramento (solução) concisa e profissional para um chamado de Service Desk.

# Regras e Contexto:
${context}

# Entrada
  Cliente: "${clientName}"
  Título: "${title}"
  Descrição: "${description || title}"

# Regras para a Mensagem de Finalização:
  - Objetivo: Confirmar que a tarefa foi concluída ou o problema foi resolvido.
  - Anonimato do Solicitante: Use APENAS "o cliente" ou "o usuário". NUNCA o nome da pessoa.
  - Palavras Proibidas: NUNCA inclua "Chamado finalizado." (é status do sistema).
  - Tom: Direto, técnico, português do Brasil.

# Saída (JSON)
  { "solucao": "Texto da solução" }`;

  return callWithFallback(apiKey, model, prompt, fallback);
}

// ─── Shared call helper ───────────────────────────────────────────────────────

/**
 * Calls the primary model; on 404 retries with the fallback model alias.
 * On any other error, throws so the caller can surface it via operation-result.
 *
 * @param {string} apiKey
 * @param {string} modelName
 * @param {string} prompt
 * @param {string} fallbackPayload  Returned when no API key is set
 */
async function callWithFallback(apiKey, modelName, prompt, fallbackPayload) {
  let attempt = 0;
  const maxRetries = process.env.NODE_ENV === "test" ? 0 : 3;

  while (attempt <= maxRetries) {
    try {
      const model = getModel(apiKey, modelName);
      const result = await model.generateContent(prompt);
      return cleanResponse(result.response.text());
    } catch (primaryError) {
      const errStr = String(primaryError);

      if (errStr.includes("429") || errStr.toLowerCase().includes("rate limit") || errStr.toLowerCase().includes("quota")) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 2000;
          console.warn(`[AI Service] Rate limit hit. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await sleep(delay);
          attempt++;
          continue;
        }
      }

      if (errStr.includes("404") || errStr.includes("Not Found")) {
        console.warn(`[AI Service] Model '${modelName}' not found — retrying with fallback alias.`);
        try {
          const fallbackModel = getModel(apiKey, modelName, true);
          const result = await fallbackModel.generateContent(prompt);
          return cleanResponse(result.response.text());
        } catch (fallbackError) {
          console.error("[AI Service] Fallback model also failed:", fallbackError);
          throw fallbackError;
        }
      }

      console.error("[AI Service] Generation error:", primaryError);
      throw primaryError;
    }
  }

  throw new Error(
    `[AI Service] Todas as ${maxRetries + 1} tentativas falharam por limite de requisicoes (429). Aguarde alguns minutos e tente novamente.`,
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateTicketMessage,
  generateSolutionMessage,
  _clearModelCache,
};
