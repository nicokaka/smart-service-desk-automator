const { chromium, firefox } = require('@playwright/test');

// Configuration
const BROWSER_TYPE = 'chromium'; // Options: 'chromium' (includes Chrome), 'firefox'
const HEADLESS = false; // Set to true for headless mode (no visible browser)
const URL = 'https://console.tomticket.com';

async function run() {
    let browser;

    try {
        console.log(`Launching ${BROWSER_TYPE}...`);

        const launchOptions = { headless: HEADLESS };

        if (BROWSER_TYPE === 'chromium') {
            browser = await chromium.launch(launchOptions);
        } else if (BROWSER_TYPE === 'firefox') {
            browser = await firefox.launch(launchOptions);
        } else {
            throw new Error(`Unsupported browser type: ${BROWSER_TYPE}`);
        }

        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`Navigating to ${URL}...`);
        await page.goto(URL);

        // --- Login Handling ---
        // Since we don't have credentials, we'll pause here for manual login or until the user provides them.
        // For development, we can wait for a specific element that appears after login (e.g., dashboard element)
        // or just pause indefinitely/for a long time.
        console.log('Please log in manually if required...');

        // Waiting for user to log in manually. 
        // Ideally, we would wait for a specific selector that indicates success, e.g., await page.waitForSelector('#dashboard');
        // For now, let's use a long pause or wait for the "Novo Chamado" button to be visible if the user navigates there manually.
        await page.pause();

        // --- Ticket Creation Logic ---
        // This part will run after the script is resumed (from the Playwright Inspector or if we remove page.pause() and add a proper wait)

        console.log('Attempting to create a ticket...');
        await createTicket(page);

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        // await browser.close(); // Commented out to keep browser open for debugging
    }
}

async function createTicket(page) {
    console.log('Filling ticket form...');

    // 1. Client (Input)
    // Selector: #customersearch
    // We type and wait for suggestions, then pick the first one or just type securely.
    // Assuming type and enter works for now, or just typing if it's a simple input.
    // If it's an autocomplete, we might need to click the option.
    await page.fill('#customersearch', 'Cliente Teste');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 2. Department (PrimeNG Dropdown)
    // Selector: #coddepartamento
    // Need to open the dropdown first.
    await page.click('#coddepartamento');
    // Wait for the dropdown panel to appear. PrimeNG usually adds a panel to the DOM.
    // We try selecting the first available option using ArrowDown + Enter, similar to Attendant.
    // This avoids issues if the typed text doesn't match exactly or is slow.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 3. Subject (Input)
    // Selector: #titulo
    await page.fill('#titulo', 'Chamado Automático Bot');

    // 4. Message (Rich Text Editor in iFrame)
    // Selector: iframe -> body.fr-view
    // We try to locate the frame.
    const iframeElement = page.frameLocator('iframe'); // Assuming first iframe is the editor
    // If there are multiple iframes, we might need a better selector, e.g. based on parent class
    await iframeElement.locator('.fr-view').fill('Olá, este é um chamado de teste criado pelo bot.');

    // 5. Priority (Select)
    // Selector: #prioridade
    // Value '2' = Normal (based on user HTML: 1=Baixa, 2=Normal, 3=Alta, 4=Urgente)
    await page.selectOption('#prioridade', '2');

    // 6. Attendant (PrimeNG Dropdown)
    // Selector: #codatendente
    await page.click('#codatendente');
    // Select first available or specific one
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    console.log('Form filled.');
}

run();
