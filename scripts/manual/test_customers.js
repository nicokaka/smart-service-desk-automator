const fs = require("fs");
const path = require("path");
const { getCustomers } = require("../../tomticket_api");

const TOKEN = process.env.TOMTICKET_TOKEN;
const OUTPUT_DIR = path.join(__dirname, "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "debug_customers.json");

async function run() {
  if (!TOKEN) {
    console.error("Set TOMTICKET_TOKEN before running this development script.");
    process.exitCode = 1;
    return;
  }

  console.log("Testing Customer Fetch...");

  try {
    const customerResult = await getCustomers(TOKEN);
    if (!customerResult.success && !customerResult.partial) {
      throw new Error(customerResult.message || "Customer fetch failed.");
    }

    const customers = Array.isArray(customerResult.data) ? customerResult.data : [];
    console.log(`Found ${customers.length} customers.`);
    if (customers.length > 0) {
      console.log("First customer:", customers[0]);
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(customers, null, 2),
      "utf8",
    );
    console.log(`Saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Error:", error);
    process.exitCode = 1;
  }
}

run();
