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
                // 1. Account (Company)
                if (credentials.account) {
                    await page.fill('#conta', credentials.account);
                    console.log(`Filled Account: ${credentials.account}`);
                }

                // 2. Email & Password
                await page.fill('#email', credentials.email);
                await page.fill('#senha', credentials.password);

                // 3. Submit
                // Trying common variations based on screenshot (Orange Button)
                // If it fails, we catch it.
                await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Entrar")');

                // Wait for navigation to Dashboard
                await page.waitForNavigation({ timeout: 10000 });
                console.log('Login submitted. Waiting for dashboard...');
            } catch (e) {
                console.warn('Auto-login attempt failed (or required captcha/2FA). Please finish manually.', e);
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
    console.log('Navigating to Ticket Form...');

    // 1. Navigate to "Novo Chamado"
    // Strategy: We assume the "Novo Chamado" button is visible (Sidebar)
    try {
        // Try to click the button by text "Novo Chamado"
        // Based on image, it's a prominent button, possibly a link or button tag.
        await page.click('text="Novo Chamado"');

        // Wait for the form to be ready - check for a unique field like #customersearch
        await page.waitForSelector('#customersearch', { timeout: 5000 });
    } catch (e) {
        console.warn('Could not click "Novo Chamado" via text, trying URL fallback or retry...');
        // Fallback: maybe we are already there? or reload dashboard?
        // await page.goto('https://console.tomticket.com/panel/chamados/novo'); // Guessing URL
    }

    // 1. Client
    console.log(`Selecting Client: ${ticket.client}`);
    await page.fill('#customersearch', ticket.client);
    await page.waitForTimeout(1000); // 1s wait for search results
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');

    // 2. Department
    console.log(`Selecting Department: ${ticket.dept}`);
    await page.click('#coddepartamento');
    await page.waitForTimeout(500);

    // Type to filter
    await page.keyboard.type(ticket.dept);
    await page.waitForTimeout(500);

    // Select Exact Match
    try {
        await page.getByText(ticket.dept, { exact: true }).filter({ hasText: ticket.dept }).first().click();
    } catch (e) {
        console.warn(`Exact match click failed for ${ticket.dept}, trying Enter fallback...`);
        await page.keyboard.press('Enter');
    }

    // Wait for the Department selection to trigger Category load
    console.log('Waiting for Category dropdown to activate...');
    await page.waitForTimeout(1000); // Reduced to 1s based on user feedback

    // 2.5. Category (Tab Navigation Strategy)
    if (ticket.category) {
        console.log(`Selecting Category: ${ticket.category}`);
        try {
            // User suggests: Tab from Department lands on Category
            console.log('Pressing Tab to focus Category...');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(500);

            // Type to filter
            await page.keyboard.type(ticket.category);
            await page.waitForTimeout(1000); // Wait for search results

            // Select First Result
            console.log('Selecting first result...');
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter');

        } catch (e) {
            console.warn('Category selection failed:', e.message);
        }
    }




    // 3. Subject (Assunto) - Fill immediately after Category
    console.log('Filling Subject...');
    // User provided ID: #titulo
    const subjectSelector = '#titulo';
    await page.waitForSelector(subjectSelector, { state: 'visible', timeout: 5000 });
    await page.fill(subjectSelector, ticket.summary.substring(0, 50));

    // 4. Message (Mensagem)
    console.log('Filling Message...');
    try {
        // Froala/RichText editor handling
        // Usually inside an iframe or a specific div contenteditable
        // Previous logic used frameLocator which is robust for iframes.
        const frame = page.frameLocator('iframe.fr-iframe'); // Adjust selector if needed
        const editor = frame.locator('.fr-view')
            .or(page.locator('.fr-view')) // Fallback if not in iframe
            .or(page.locator('div[contenteditable="true"]')); // Generic fallback

        await editor.first().fill(ticket.message || ticket.summary);
    } catch (msgError) {
        console.warn('Message fill failed, trying simple input fallback:', msgError.message);
        // Fallback for simple textarea
        await page.fill('textarea[name="mensagem"]', ticket.message || ticket.summary).catch(() => { });
    }

    // 5. Priority (Prioridade)
    console.log('Setting Priority: Normal');
    try {
        // Updated: Use selectOption for native select
        await page.selectOption('#prioridade', '2'); // 2 = Normal
    } catch (e) {
        console.warn('Priority selection failed:', e.message);
    }

    // 6. Attendant (Atendente) - Disabled per user request
    /*
    console.log('Selecting Attendant...');
    try {
        const attendantDropdown = await page.$('text="Escolher atendente..."') || await page.$('#codatendente');
        if (attendantDropdown) {
            await attendantDropdown.click();
            await page.waitForTimeout(300);
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
        }
    } catch (e) {
        console.warn('Attendant selection failed.');
    }
    */


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
