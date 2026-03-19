const fs = require("fs");
const { getTickets } = require("./tomticket_api");

const TOKEN = process.env.TOMTICKET_TOKEN;

async function test() {
  if (!TOKEN) {
    console.error("Set TOMTICKET_TOKEN before running this development script.");
    process.exitCode = 1;
    return;
  }

  try {
    const response = await getTickets(TOKEN, { page: 1 });
    fs.writeFileSync(
      "api_response.json",
      JSON.stringify(response, null, 2),
      "utf8",
    );
    console.log("Written to api_response.json");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

test();
