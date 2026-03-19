const fs = require("fs");
const { getCustomers } = require("./tomticket_api");

const TOKEN = process.env.TOMTICKET_TOKEN;

async function run() {
  if (!TOKEN) {
    console.error("Set TOMTICKET_TOKEN before running this development script.");
    process.exitCode = 1;
    return;
  }

  console.log("Testing Customer Fetch...");

  try {
    const customers = await getCustomers(TOKEN);
    console.log(`Found ${customers.length} customers.`);
    if (customers.length > 0) {
      console.log("First customer:", customers[0]);
    }

    fs.writeFileSync(
      "debug_customers.json",
      JSON.stringify(customers, null, 2),
      "utf8",
    );
    console.log("Saved to debug_customers.json");
  } catch (error) {
    console.error("Error:", error);
    process.exitCode = 1;
  }
}

run();
