const fs = require("fs");
const path = require("path");
const { createTicket } = require("../../tomticket_api");

const TOKEN = process.env.TOMTICKET_TOKEN;
const CUSTOMERS_FILE = path.join(__dirname, "output", "debug_customers.json");

process.on("uncaughtException", (error) => {
  console.error("CRITICAL ERROR (Uncaught Exception):", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("CRITICAL ERROR (Unhandled Rejection):", reason);
});

async function run() {
  if (!TOKEN) {
    console.error("Set TOMTICKET_TOKEN before running this development script.");
    process.exitCode = 1;
    return;
  }

  console.log("Testing Ticket Creation API...");

  let customers = [];
  try {
    if (!fs.existsSync(CUSTOMERS_FILE)) {
      console.error(`File ${CUSTOMERS_FILE} not found. Run test_customers.js first.`);
      process.exitCode = 1;
      return;
    }

    customers = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, "utf8"));
  } catch (error) {
    console.error(`Failed to read ${CUSTOMERS_FILE}:`, error);
    process.exitCode = 1;
    return;
  }

  const testCustomer = customers.find((customer) => customer.id);
  if (!testCustomer) {
    console.error("No customer with valid ID found in the list.");
    process.exitCode = 1;
    return;
  }

  const ticketData = {
    customer_id: testCustomer.id,
    department_id: process.env.TOMTICKET_TEST_DEPARTMENT_ID || "",
    subject: "TESTE BOT API - Integracao",
    message:
      "Esta e uma mensagem de teste gerada automaticamente pelo script de desenvolvimento. Pode fechar.",
    priority: 2,
  };

  if (!ticketData.department_id) {
    console.error("Set TOMTICKET_TEST_DEPARTMENT_ID before running this script.");
    process.exitCode = 1;
    return;
  }

  console.log(`Using Customer: ${testCustomer.name} (ID: ${testCustomer.id})`);
  console.log("Payload:", ticketData);

  try {
    const result = await createTicket(TOKEN, ticketData);
    console.log("API Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Creation Failed:", error.message);
    if (error.response) {
      console.error("Error Response Data:", error.response.data);
      console.error("Error Response Status:", error.response.status);
    }
    process.exitCode = 1;
  }
}

run();
