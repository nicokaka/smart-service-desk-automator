const { chromium, firefox } = require('@playwright/test');

// Configuração
const HEADLESS = false; // Navegador visível
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

        // --- Tratamento de Login ---
        if (credentials.email && credentials.password) {
            console.log('Attempting auto-login...');
            try {
                // 1. Conta (Empresa)
                if (credentials.account) {
                    await page.fill('#conta', credentials.account);
                    console.log(`Filled Account: ${credentials.account}`);
                }

                // 2. Email e Senha
                await page.fill('#email', credentials.email);
                await page.fill('#senha', credentials.password);

                // 3. Enviar
                // Tentando variações comuns baseadas na captura de tela (Botão Laranja)
                // Se falhar, nós capturamos o erro.
                await page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Entrar")');

                // Aguardar navegação para o Dashboard
                await page.waitForNavigation({ timeout: 10000 });
                console.log('Login submitted. Waiting for dashboard...');
            } catch (e) {
                console.warn('Auto-login attempt failed (or required captcha/2FA). Please finish manually.', e);
            }
        }

        console.log('Aguardando usuário confirmar login...');
        // Pausamos apenas se NÃO estiver logado (necessária lógica de detecção)
        // Por enquanto, pausa simples para deixar o usuário logar uma vez.
        // Se estivermos processando um lote, queremos logar apenas UMA vez.
        // Podemos usar um timeout ou uma verificação específica.

        // Usando uma pausa menor ou aguardando um elemento conhecido como o dashboard
        // await page.pause(); // User requested to remove manual steps if possible, but we keep it safe for now.
        // Melhor: verificação.

        console.log('Iniciando processamento em lote...');

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

    // 1. Navegar para "Novo Chamado"
    // Estratégia: Assumimos que o botão "Novo Chamado" está visível (Barra lateral)
    try {
        // Tentar clicar no botão pelo texto "Novo Chamado"
        // Baseado na imagem, é um botão proeminente, possivelmente um link ou tag button.
        await page.click('text="Novo Chamado"');

        // Aguardar formulário estar pronto - verificar campo único como #customersearch
        await page.waitForSelector('#customersearch', { timeout: 5000 });
    } catch (e) {
        console.warn('Não foi possível clicar em "Novo Chamado" via texto, tentando URL de fallback ou nova tentativa...');
        // Fallback: talvez já estejamos lá? ou recarregar dashboard?
        // await page.goto('https://console.tomticket.com/panel/chamados/novo'); // Tentando adivinhar URL
    }

    // 1. Cliente
    console.log(`Selecting Client: ${ticket.client}`);
    await page.fill('#customersearch', ticket.client);
    await page.waitForTimeout(1000); // Espera de 1s para resultados de busca
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');

    // 2. Departamento
    console.log(`Selecting Department: ${ticket.dept}`);
    await page.click('#coddepartamento');
    await page.waitForTimeout(500);

    // Digitar para filtrar
    await page.keyboard.type(ticket.dept);
    await page.waitForTimeout(500);

    // Selecionar Correspondência Exata
    try {
        await page.getByText(ticket.dept, { exact: true }).filter({ hasText: ticket.dept }).first().click();
    } catch (e) {
        console.warn(`Exact match click failed for ${ticket.dept}, trying Enter fallback...`);
        await page.keyboard.press('Enter');
    }

    // Aguardar seleção de Departamento para carregar Categoria
    console.log('Waiting for Category dropdown to activate...');
    await page.waitForTimeout(1000); // Reduzido para 1s baseado em feedback do usuário

    // 2.5. Categoria (Estratégia de Navegação via Tab)
    if (ticket.category) {
        console.log(`Selecting Category: ${ticket.category}`);
        try {
            // Usuário sugere: Tab do Departamento cai na Categoria
            console.log('Pressing Tab to focus Category...');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(500);

            // Digitar para filtrar
            await page.keyboard.type(ticket.category);
            await page.waitForTimeout(1000); // Aguardar resultados da pesquisa

            // Selecionar Primeiro Resultado
            console.log('Selecting first result...');
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter');

        } catch (e) {
            console.warn('Category selection failed:', e.message);
        }
    }




    // 3. Assunto - Preencher imediatamente após Categoria
    console.log('Filling Subject...');
    // ID fornecido pelo usuário: #titulo
    const subjectSelector = '#titulo';
    await page.waitForSelector(subjectSelector, { state: 'visible', timeout: 5000 });
    await page.fill(subjectSelector, ticket.summary.substring(0, 50));

    // 4. Mensagem
    console.log('Filling Message...');
    try {
        // Tratamento do editor Froala/RichText
        // Geralmente dentro de um iframe ou uma div contenteditable específica
        // Lógica anterior usava frameLocator que é robusto para iframes.
        const frame = page.frameLocator('iframe.fr-iframe'); // Adjust selector if needed
        const editor = frame.locator('.fr-view')
            .or(page.locator('.fr-view')) // Fallback se não estiver no iframe
            .or(page.locator('div[contenteditable="true"]')); // Fallback genérico

        await editor.first().fill(ticket.message || ticket.summary);
    } catch (msgError) {
        console.warn('Message fill failed, trying simple input fallback:', msgError.message);
        // Fallback para textarea simples
        await page.fill('textarea[name="mensagem"]', ticket.message || ticket.summary).catch(() => { });
    }

    // 5. Prioridade
    console.log('Setting Priority: Normal');
    try {
        // Atualizado: Usar selectOption para select nativo
        await page.selectOption('#prioridade', '2'); // 2 = Normal
    } catch (e) {
        console.warn('Priority selection failed:', e.message);
    }

    // 6. Atendente
    if (ticket.attendant) {
        console.log(`Selecting Attendant: ${ticket.attendant}`);
        try {
            await page.click('#codatendente'); // Click dropdown
            await page.waitForTimeout(300);

            // Filter and select
            await page.keyboard.type(ticket.attendant);
            await page.waitForTimeout(500);
            await page.keyboard.press('ArrowDown'); // Ensure first item is highlighted
            await page.waitForTimeout(100);
            await page.keyboard.press('Enter');
        } catch (e) {
            console.warn('Attendant selection failed:', e.message);
        }
    }


    // 7. Resolver imediatamente?
    if (ticket.resolve) {
        // Lógica para resolver
        console.log('Deve resolver este chamado imediatamente (Não implementado ainda).');
    }

    // 8. Enviar
    // await page.click('#btn-save'); // TODO: Adicionar seletor
    console.log('Formulário preenchido. Placeholder do botão de envio.');

    // Aguardar sucesso?
    await page.waitForTimeout(1000);
}

module.exports = { runBot };
