const { getTickets } = require('./tomticket_api');
const fs = require('fs');
const TOKEN = '966a7ae7cd050147e799b3f1c92923659ae3286f2a8c997c49543e1081ca136d';

async function test() {
    try {
        const response = await getTickets(TOKEN, { page: 1 });
        fs.writeFileSync('api_response.json', JSON.stringify(response, null, 2), 'utf8');
        console.log('Written to api_response.json');
    } catch (e) {
        console.error(e);
    }
}
test();
