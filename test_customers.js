const { getCustomers } = require('./tomticket_api');
const fs = require('fs');

// Ler token do arquivo ou usar um hardcoded para teste rápido se não tiver acesso ao localStorage aqui
// Como é node, não temos localStorage. Vamos pegar do arquivo test_token.js se tiver, ou pedir para o usuário?
// O usuário já rodou com sucesso antes?
const TOKEN = '966a7ae7cd050147e799b3f1c92923659ae3286f2a8c997c49543e1081ca136d'; // Pegando do histórico (viewed file test_token.js)

async function run() {
    console.log('Testing Customer Fetch...');
    try {
        const customers = await getCustomers(TOKEN);
        console.log(`Found ${customers.length} customers.`);
        if (customers.length > 0) {
            console.log('First customer:', customers[0]);
        }

        fs.writeFileSync('debug_customers.json', JSON.stringify(customers, null, 2));
        console.log('Saved to debug_customers.json');
    } catch (error) {
        console.error('Error:', error);
    }
}

run();
