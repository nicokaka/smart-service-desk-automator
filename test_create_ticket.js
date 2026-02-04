const { createTicket } = require('./tomticket_api');
const fs = require('fs');

process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Ler Token do arquivo de teste se existir, ou usar um hardcoded
let TOKEN = '966a7ae7cd050147e799b3f1c92923659ae3286f2a8c997c49543e1081ca136d';
try {
    const tokenFile = fs.readFileSync('test_token.js', 'utf8');
    // Tentar extrair token se o formato for simples, ou manter o hardcoded
} catch (e) { }

async function run() {
    console.log('Testing Ticket Creation API...');

    // Ler clientes do arquivo de debug
    let customers = [];
    try {
        if (!fs.existsSync('debug_customers.json')) {
            console.error('File debug_customers.json not found. Run test_customers.js first.');
            return;
        }
        const data = fs.readFileSync('debug_customers.json', 'utf8');
        customers = JSON.parse(data);
    } catch (e) {
        console.error('Failed to read debug_customers.json:', e);
        return;
    }

    if (!Array.isArray(customers) || customers.length === 0) {
        console.error('No customers found in debug file.');
        return;
    }

    console.log(`Total customers loaded from file: ${customers.length}`);

    // Procurar um cliente com ID válido
    const testCustomer = customers.find(c => c.id);

    if (!testCustomer) {
        console.error('No customer with valid ID found in the list!');
        console.log('Sample of first customer:', customers[0]);
        return;
    }

    console.log(`Using Customer: ${testCustomer.name} (ID: ${testCustomer.id})`);

    // Dados do Chamado de Teste
    const ticketData = {
        customer_id: testCustomer.id,
        department_id: '2352b2707252eff5661957de01525a7a', // ID fixo para TI (exemplo) ou pegar dinâmico se tiver
        subject: 'TESTE BOT API - Integracao',
        message: 'Esta é uma mensagem de teste gerada automaticamente pelo script de desenvolvimento. Pode fechar.',
        priority: 2 // Normal
    };

    console.log('Payload:', ticketData);

    try {
        console.log('Calling API to create ticket...');
        const result = await createTicket(TOKEN, ticketData);
        console.log('API Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Creation Failed:', error.message);
        if (error.response) {
            console.error('Error Response Data:', error.response.data);
            console.error('Error Response Status:', error.response.status);
        }
    }
}

run();
