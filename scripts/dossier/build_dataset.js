const fs = require("fs");

function normalizeText(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const content = fs.readFileSync("dossie_34_chamados.md", "utf8");
const rawBlocks = content.split(/### 🔹 \[Chamado /i).slice(1);

const parsed = rawBlocks.map((block, idx) => {
  const num = idx + 1;
  const header = block.split("\n")[0].trim();
  const typeMatch = block.match(/- \*\*Tipo:\*\*\s*(.*)/i);
  const solMatch = block.match(/- \*\*Solicitante:\*\*\s*(.*)/i);
  const medMatch = block.match(/- \*\*Médico\(a\):\*\*\s*(.*)/i);
  const crmMatch = block.match(/- \*\*CRM:\*\*\s*(.*)/i);
  const setorMatch = block.match(/- \*\*Setor(?:\s*Origem\s*➔\s*Destino)?:\*\*\s*(.*)/i);

  let text = "";
  const lines = block.split("\n");
  const textLineIdx = lines.findIndex(l => l.includes("Texto para Chamado"));
  if (textLineIdx !== -1) {
    const rawLine = lines[textLineIdx];
    const afterColon = rawLine.substring(rawLine.indexOf("Texto para Chamado") + "Texto para Chamado:".length).trim();
    if (afterColon.length > 5) {
      text = afterColon;
    } else if (lines[textLineIdx + 1]) {
      text = lines[textLineIdx + 1].trim();
    }
  }

  text = text.replace(/^[>*\s"']+|[>*\s"']+$/g, "").trim();

  const solRaw = solMatch ? solMatch[1].trim() : "";
  const normSol = normalizeText(solRaw);

  let email = null;
  let clientName = null;

  if (normSol.includes("janaina")) {
    email = "janaina.regina@hebron.com.br";
    clientName = "Janaina Regina";
  } else if (normSol.includes("vanessa")) {
    email = "vanessa.gomes@hebron.com.br";
    clientName = "Vanessa Gomes";
  } else if (normSol.includes("patricia")) {
    email = "patricia.vieira@hebron.com.br";
    clientName = "Patricia Vieira";
  } else if (normSol.includes("felipe")) {
    email = "STANDBY";
    clientName = "Felipe";
  }

  let subject = "";
  const medClean = medMatch ? medMatch[1].split("|")[0].trim() : "";
  if (typeMatch && typeMatch[1].includes("Transferência")) {
    subject = `Transferência de Contato - ${medClean}`;
  } else if (typeMatch && typeMatch[1].includes("Aprovação")) {
    subject = `Aprovação de Solicitações em Lote - Distrito 90.11`;
  } else if (typeMatch && typeMatch[1].includes("Reativação")) {
    subject = `Reativação de Contato - ${medClean}`;
  } else {
    subject = header;
  }

  return {
    num,
    header,
    subject,
    type: typeMatch ? typeMatch[1].trim() : "",
    solicitanteRaw: solRaw,
    clientName,
    email,
    medico: medClean,
    crm: crmMatch ? crmMatch[1].trim() : "",
    setor: setorMatch ? setorMatch[1].trim() : "",
    message: text,
  };
});

fs.writeFileSync("scratch/tickets_to_execute.json", JSON.stringify(parsed, null, 2), "utf8");
console.log(`Parsed ${parsed.length} tickets.`);

const summary = {};
parsed.forEach(p => {
  summary[p.clientName] = (summary[p.clientName] || 0) + 1;
});
console.log("Client count summary:", summary);
