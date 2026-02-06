const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const logFile = 'model_test_log.txt';

function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

// Clear log
fs.writeFileSync(logFile, '');

// Replace with the key you are using or pass it as an arg
const API_KEY = process.argv[2] || process.env.GEMINI_API_KEY;

if (!API_KEY) {
    log("Please provide an API KEY as an argument.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

async function listModels() {
    log("Fetching models via raw HTTP...");
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            log("Available Models:");
            data.models.forEach(m => log(`- ${m.name}`));
        } else {
            log("No models returned or error: " + JSON.stringify(data));
        }
    } catch (e) {
        log("Fetch Error: " + e.message);
    }
}

listModels();
