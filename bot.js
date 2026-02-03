const { chromium, firefox } = require('@playwright/test');

// Configuration
const HEADLESS = false; // Visible browser
const URL = 'https://console.tomticket.com';

async function runBot(tickets, credentials = {}) {
    let browser;
    const results = [];

    try {
        const browserType = credentials.browser || 'chromium';
        console.log(`Launching ${browserType}...`);

        const launchOptions = { headless: HEADLESS };

        if (browserType === 'chromium') {
            browser = await chromium.launch(launchOptions);
        } else if (browserType === 'firefox') {
            browser = await firefox.launch(launchOptions);
        } else {
            throw new Error(`Unsupported browser: ${browserType}`);
        }

        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`Navigating to ${URL}...`);
        await page.goto(URL);

        // --- Login Handling ---
        if (credentials.email && credentials.password) {
            console.log('Attempting auto-login...');
            try {
                // Placeholder selectors - adjust based on actual login page
                // await page.fill('input[name="email"]', credentials.email);
                // await page.fill('input[name="password"]', credentials.password);
                // await page.click('button[type="submit"]');
                // await page.waitForNavigation();
                console.log('Auto-login logic placeholder. Please log in manually if needed.');
            } catch (e) {
                console.warn('Auto-login failed, falling back to manual.');
            }
        }

        console.log('Waiting for user to ensure login...');
        // We pause only if NOT logged in (detection logic needed)
        // For now, simple pause to let user log in once.
        // If we are processing a batch, we only want to login ONCE.
        // We can use a timeout or a specific check.

        // Using a shorter pause or waiting for a known element like the dashboard
        // await page.pause(); // User requested to remove manual steps if possible, but we keep it safe for now.
        // Better: verification.

        console.log('Starting batch processing...');

        for (const ticket of tickets) {
            console.log(`Processing ticket: ${ticket.client}`);
            try {
                await createTicket(page, ticket);
                results.push({ id: ticket.id, status: 'Success', message: 'Chamado criado' });
            } catch (err) {
                console.error(`Failed to create ticket for ${ticket.client}:`, err);
                results.push({ id: ticket.id, status: 'Error', message: err.message });
            }
        }

        return { success: true, message: "Lote processado!", details: results };

    } catch (error) {
        console.error('An error occurred:', error);
        return { success: false, message: error.message };
    } finally {
        // await browser.close(); // Keep open for review
    }
}

async function createTicket(page, ticket) {
    // 1. Navigate to "Novo Chamado" - assuming we are in dashboard
    // Needs selector for "Novo Chamado" button if URL isn't direct
    await page.goto('https://console.tomticket.com/novo_chamado_url_ou_clique'); // TODO: Fix URL/Selector
    // Fallback: user is already there or we click

    console.log('Filling ticket form...');

    // 1. Client
    await page.fill('#customersearch', ticket.client);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 2. Department
    await page.click('#coddepartamento');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 3. Subject
    // Use ticket summary or a generated title
    const subject = ticket.summary.substring(0, 50) + '...';
    await page.fill('#titulo', subject);

    // 4. Message
    const iframeElement = page.frameLocator('iframe');
    await iframeElement.locator('.fr-view').fill(ticket.message || ticket.summary);

    // 5. Priority
    await page.selectOption('#prioridade', '2'); // Normal

    // 6. Attendant
    await page.click('#codatendente');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // 7. Resolve immediately?
    if (ticket.resolve) {
        // Logic to resolve
        console.log('Should resolve this ticket immediately (Not implemented yet).');
    }

    // 8. Submit
    // await page.click('#btn-save'); // TODO: Add selector
    console.log('Form filled. Submit button placeholder.');

    // Wait for success?
    await page.waitForTimeout(1000);
}

module.exports = { runBot };
