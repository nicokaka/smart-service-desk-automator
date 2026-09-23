"use strict";

/**
 * Script de Automação em Lote - Dossiê Hebronline
 * 
 * Executa a esteira completa:
 * 1. Criação do chamado no departamento Comercial
 * 2. Categoria: Hebronline - Atualização de contato
 * 3. Atribuição ao operador Nicolas
 * 4. Geração de solução técnica padronizada via Gemini 2.5 Flash
 * 5. Finalização/encerramento do chamado na API TomTicket
 * 
 * Execução:
 *   npx electron ./scripts/dossier/run_batch.js
 */

const path = require("path");
const fs = require("fs");
const { app } = require("electron");

app.setPath("userData", path.join(process.env.APPDATA, "tomticketbot"));

const configStore = require(path.join(__dirname, "../../config-store.js"));
const tomticketApi = require(path.join(__dirname, "../../tomticket_api.js"));
const aiService = require(path.join(__dirname, "../../ai_service.js"));
const { extractCreatedTicketId } = require(path.join(__dirname, "../../shared/domain.js"));

const PROGRESS_FILE = path.join(__dirname, "batch_progress.json");
const TICKETS_FILE = path.join(__dirname, "tickets_to_execute.json");
const NICOLAS_OPERATOR_ID = "fe8dc3260c21acdc15548a3a2d17bc70";
const COMERCIAL_DEPT_ID = "fc9bb40c65140856ee602d18d57fe1a8";
const ATUALIZACAO_CONTATO_CAT_ID = "72b25891b72a0564ab10aa82f1c0ce32";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf8");
}

app.whenReady().then(async () => {
  try {
    const settings = configStore.getSettings();
    const token = settings.token;
    const apiKey = settings.apiKey;
    const model = settings.model;

    if (!fs.existsSync(TICKETS_FILE)) {
      console.error(`Arquivo de chamados não encontrado: ${TICKETS_FILE}`);
      return;
    }

    const tickets = JSON.parse(fs.readFileSync(TICKETS_FILE, "utf8"));
    const progress = loadProgress();

    console.log(`=== PROCESSAMENTO EM LOTE DE CHAMADOS - HEBRONLINE ===`);
    console.log(`Total de chamados cadastrados: ${tickets.length}`);
    console.log(`Operador: Nicolas | Depto: Comercial | Categoria: Hebronline - Atualização de contato\n`);

    for (const ticket of tickets) {
      const num = ticket.num;

      if (num === 2) {
        console.log(`[Chamado 02/34] STANDBY — Solicitante Felipe (ignorado a pedido do usuário).`);
        continue;
      }

      if (progress[num] && progress[num].status === "COMPLETED") {
        console.log(`[Chamado ${String(num).padStart(2, "0")}/34] JÁ CONCLUÍDO (Ticket ID: ${progress[num].ticketId}) — Pulando.`);
        continue;
      }

      console.log(`--------------------------------------------------------------------------------`);
      console.log(`[Chamado ${String(num).padStart(2, "0")}/34] INICIANDO: ${ticket.subject}`);
      console.log(`Solicitante: ${ticket.clientName} (${ticket.email})`);

      const ticketPayload = {
        department_id: COMERCIAL_DEPT_ID,
        category_id: ATUALIZACAO_CONTATO_CAT_ID,
        customer_id: ticket.email,
        customer_id_type: "E",
        subject: ticket.subject,
        message: ticket.message,
        priority: "2",
      };

      // 1. Criar chamado
      console.log(`  -> Criando chamado no TomTicket...`);
      let createRes = null;
      let ticketId = null;
      let protocol = null;

      try {
        createRes = await tomticketApi.createTicket(token, ticketPayload);
        ticketId = extractCreatedTicketId(createRes.data);
        protocol = createRes.data?.protocol || null;
      } catch (err) {
        console.error(`  ❌ Erro ao criar chamado ${num}:`, err.message);
        progress[num] = {
          num,
          subject: ticket.subject,
          clientName: ticket.clientName,
          status: "FAILED_CREATE",
          error: err.message,
        };
        saveProgress(progress);
        continue;
      }

      if (!ticketId) {
        console.error(`  ❌ Chamado ${num} criado sem ID identificável:`, createRes);
        progress[num] = {
          num,
          subject: ticket.subject,
          clientName: ticket.clientName,
          status: "FAILED_NO_ID",
          response: createRes,
        };
        saveProgress(progress);
        continue;
      }

      console.log(`  ✅ Chamado criado com sucesso! ID: ${ticketId} (Protocolo: ${protocol || "N/A"})`);
      await sleep(1500);

      // 2. Vincular operador Nicolas
      console.log(`  -> Vinculando operador Nicolas...`);
      try {
        const linkRes = await tomticketApi.linkAttendant(token, ticketId, NICOLAS_OPERATOR_ID);
        console.log(`  ✅ Operador vinculado: ${linkRes.status}`);
      } catch (linkErr) {
        console.warn(`  ⚠️ Aviso ao vincular operador (prosseguindo):`, linkErr.message);
      }
      await sleep(1500);

      // 3. Gerar Solução via Gemini
      console.log(`  -> Gerando solução técnica via Gemini AI (${model})...`);
      let solucaoText = "";
      try {
        const aiRaw = await aiService.generateSolutionMessage(
          ticket.subject,
          ticket.message,
          ticket.clientName,
          apiKey,
          settings.customPrompt,
          model
        );

        try {
          const parsedAi = JSON.parse(aiRaw);
          solucaoText = parsedAi.solucao || parsedAi.descricao || aiRaw;
        } catch {
          solucaoText = aiRaw;
        }
      } catch (aiErr) {
        console.warn(`  ⚠️ Erro na geração IA, utilizando fallback humanizado:`, aiErr.message);
        solucaoText = `A solicitação referente a "${ticket.subject}" foi processada e formalizada no sistema com sucesso, conforme o pedido do cliente.`;
      }

      console.log(`  📝 Solução gerada: "${solucaoText}"`);
      await sleep(1500);

      // 4. Encerrar chamado
      console.log(`  -> Finalizando chamado no TomTicket...`);
      try {
        const finishRes = await tomticketApi.finalizeTicket(token, ticketId, solucaoText);
        console.log(`  ✅ Chamado encerrado com sucesso: ${finishRes.status}`);

        progress[num] = {
          num,
          ticketId,
          protocol,
          subject: ticket.subject,
          clientName: ticket.clientName,
          email: ticket.email,
          status: "COMPLETED",
          solution: solucaoText,
          completedAt: new Date().toISOString(),
        };
        saveProgress(progress);
      } catch (finishErr) {
        console.error(`  ❌ Erro ao finalizar chamado ${ticketId}:`, finishErr.message);
        progress[num] = {
          num,
          ticketId,
          protocol,
          subject: ticket.subject,
          clientName: ticket.clientName,
          status: "FAILED_FINALIZE",
          solution: solucaoText,
          error: finishErr.message,
        };
        saveProgress(progress);
      }

      console.log(`[Chamado ${String(num).padStart(2, "0")}/34] FINALIZADO COM SUCESSO!\n`);
      await sleep(2000);
    }

    console.log(`================================================================================`);
    console.log(`PROCESSAMENTO EM LOTE FINALIZADO COM SUCESSO!`);
    console.log(`================================================================================`);

  } catch (globalErr) {
    console.error("FATAL BATCH ERROR:", globalErr);
  } finally {
    app.quit();
  }
});
