const fs = require("fs");
const path = require("path");
const { getTickets } = require("../../tomticket_api");

const TOKEN = process.env.TOMTICKET_TOKEN;
const OUTPUT_DIR = path.join(__dirname, "output");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "api_response.json");

async function test() {
  if (!TOKEN) {
    console.error("Set TOMTICKET_TOKEN before running this development script.");
    process.exitCode = 1;
    return;
  }

  try {
    const response = await getTickets(TOKEN, { page: 1 });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(response, null, 2),
      "utf8",
    );
    console.log(`Written to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

test();
