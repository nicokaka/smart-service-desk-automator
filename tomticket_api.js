const https = require('https');
const querystring = require('querystring'); // Built-in module

const API_BASE_URL = 'https://api.tomticket.com/v2.0';

/**
 * Função genérica para fazer requisições à API do TomTicket
 * @param {string} endpoint - O endpoint da API (ex: '/ticket/list')
 * @param {string} token - O Token de API do usuário
 * @param {string} method - Método HTTP (GET, POST, etc.)
 * @param {object} params - Parâmetros de consulta ou corpo
 */
function tomticketRequest(endpoint, token, method = 'GET', params = {}) {
    return new Promise((resolve, reject) => {
        let url = `${API_BASE_URL}${endpoint}`;
        let bodyData = null;

        // Lidar com Parâmetros de Consulta para GET
        if (method === 'GET' && Object.keys(params).length > 0) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        } else if (method === 'POST') {
            // Para POST, usar x-www-form-urlencoded
            bodyData = querystring.stringify(params);
        }

        const options = {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                // 'Content-Type': 'application/json' <--- JSON falhou
                'Content-Type': 'application/x-www-form-urlencoded' // Tentar esse formato
            }
        };

        if (bodyData) {
            options.headers['Content-Length'] = Buffer.byteLength(bodyData);
        }

        console.log(`[API] Requesting ${method} ${url}`);

        const req = https.request(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    // TomTicket retorna 200/201 ok, mas as vezes retorna 400 com message
                    // 401 com "Enter the customer identifier" era o erro do JSON
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        // Rejeitar com detalhes
                        const err = new Error(`API Error ${res.statusCode}: ${parsed.message || data}`);
                        err.response = { status: res.statusCode, data: parsed };
                        reject(err);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (bodyData) {
            req.write(bodyData);
        }

        req.end();
    });
}

/**
 * Buscar chamados do TomTicket
 * @param {string} token - API Token
 * @param {object} filters - Filtros como { operator_id: '...', situation: '0,1,2' }
 */
// ... (Cleaner functions)

async function getTickets(token, filters = {}) {
    try {
        const defaultFilters = {
            'page': 1,
            'situation': '0,1,2,3,6,7,8,9,10,11'
        };
        const finalParams = { ...defaultFilters, ...filters };
        const response = await tomticketRequest('/ticket/list', token, 'GET', finalParams);
        return response;
    } catch (error) {
        console.error('TomTicket API Error:', error);
        throw error;
    }
}

async function getDepartments(token) {
    try {
        const response = await tomticketRequest('/department/list', token, 'GET');
        return response.data || [];
    } catch (error) {
        console.error('API Error (Departments):', error);
        return [];
    }
}

async function getCategories(token, departmentId) {
    try {
        const response = await tomticketRequest('/department/category/list', token, 'GET', { department_id: departmentId });
        return response.data || [];
    } catch (error) {
        console.error(`API Error (Categories for ${departmentId}):`, error);
        return [];
    }
}

async function getCustomers(token) {
    let clients = [];
    try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await tomticketRequest('/customer/list', token, 'GET', { page: page });

            if (response.data && response.data.length > 0) {
                clients = clients.concat(response.data);
                page++;
            } else {
                hasMore = false;
            }

            if (page > 30) {
                console.warn('Limite de páginas de clientes atingido (30). Parando.');
                hasMore = false;
            }
        }

        return clients;
    } catch (error) {
        console.error('API Error (Customers):', error);
        return clients;
    }
}

async function getOperators(token) {
    let operators = [];

    // Strategy 1: Try /operator/list (Standard?)
    try {
        console.log('Attempting /operator/list...');
        const response = await tomticketRequest('/operator/list', token, 'GET');
        if (response.data && response.data.length > 0) {
            return response.data;
        }
    } catch (e) { console.warn('/operator/list failed or empty'); }

    // Strategy 2: Try /attendant/list (Guess based on PT term)
    try {
        console.log('Attempting /attendant/list...');
        const response = await tomticketRequest('/attendant/list', token, 'GET');
        if (response.data && response.data.length > 0) {
            return response.data;
        }
    } catch (e) { console.warn('/attendant/list failed or empty'); }

    // Strategy 3: Fallback - Extract from Tickets
    try {
        console.log('Attempting extraction from recent tickets...');
        // Fetch last 100 tickets to get a good sample of active operators
        const ticketsResponse = await getTickets(token, { page: 1 });
        const tickets = ticketsResponse.data || [];

        const operatorMap = new Map();
        tickets.forEach(t => {
            if (t.operator && t.operator.id) {
                operatorMap.set(t.operator.id, t.operator);
            }
        });

        operators = Array.from(operatorMap.values());
        console.log(`Extracted ${operators.length} operators from tickets.`);
    } catch (e) {
        console.error('Fallback extraction failed:', e);
    }

    return operators;
}

async function createTicket(token, ticketData) {
    try {
        const response = await tomticketRequest('/ticket/new', token, 'POST', ticketData);
        return response;
    } catch (error) {
        console.error('API Error (Create Ticket):', error);
        throw error;
    }
}

module.exports = { getTickets, getDepartments, getCategories, getCustomers, getOperators, createTicket };
