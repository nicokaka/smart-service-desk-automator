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
        return response.data || response; // Unwrap if necessary
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
        console.log(`[API] Fetching categories for Dept ${departmentId}...`);
        const response = await tomticketRequest('/department/category/list', token, 'GET', { department_id: departmentId });
        const cats = response.data || [];
        console.log(`[API] Dept ${departmentId} has ${cats.length} categories.`);
        return cats;
    } catch (error) {
        console.error(`API Error (Categories for ${departmentId}):`, error);
        return [];
    }
}

async function getCustomers(token) {
    let clients = [];
    let page = 1;
    let hasMore = true;
    const MAX_RETRIES = 3;

    try {
        while (hasMore) {
            console.log(`[API] Fetching Customers Page ${page}... (Current Total: ${clients.length})`);

            let attempts = 0;
            let success = false;
            let response = null;

            while (attempts < MAX_RETRIES && !success) {
                attempts++;
                try {
                    // Remove 'limit' as API seems to ignore it or stick to 50
                    response = await tomticketRequest('/customer/list', token, 'GET', { page: page });
                    success = true;
                } catch (err) {
                    console.warn(`[API] Error fetching page ${page} (Attempt ${attempts}/${MAX_RETRIES}):`, err.message);
                    if (attempts < MAX_RETRIES) {
                        console.log(`[API] Retrying page ${page} in 2 seconds...`);
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        console.error(`[API] Failed to fetch page ${page} after ${MAX_RETRIES} attempts.`);
                        // Option: continue to next page? Or stop? 
                        // If a page fails completely, we might miss data. Let's stop to avoid partial sync state being treated as full.
                        throw new Error(`Failed to fetch page ${page} after multiple attempts.`);
                    }
                }
            }

            if (response && response.data && Array.isArray(response.data)) {
                const count = response.data.length;
                console.log(`[API] Page ${page}: Received ${count} customers.`);

                if (count > 0) {
                    clients = clients.concat(response.data);

                    // Check if we should continue
                    // API Documentation says 'next_page' is null if no more pages, or maybe we just check if count < 50?
                    // Let's rely on data presence first.
                    // If response.next_page is explicitly null, we stop.
                    if (response.next_page === null) {
                        console.log(`[API] Page ${page} indicated no next page.`);
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    console.log(`[API] Page ${page} returned 0 customers. Reached end.`);
                    hasMore = false;
                }
            } else {
                console.log(`[API] Page ${page} invalid response format or empty. Stopping.`);
                hasMore = false;
            }

            // Safety limit (increased)
            if (page > 1000) {
                console.warn('Limite de segurança de páginas de clientes atingido (1000). Parando.');
                hasMore = false;
            }

            // Rate Limit Protection delay
            if (hasMore) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return clients;
    } catch (error) {
        console.error('API Error (Customers):', error);
        // Return what we have so far? or rethrow? 
        // Returning partial data might be better than nothing, but user should be warned.
        // For now, let's return partial but log heavily.
        return clients;
    }
}

async function getOperators(token) {
    let operators = [];
    const operatorMap = new Map();

    // Strategy 1: Try /operator/list (Standard?)
    try {
        console.log('[API] Attempting Operator Strategy 1: /operator/list');
        const response = await tomticketRequest('/operator/list', token, 'GET');
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            console.log(`[API] /operator/list returned ${response.data.length} operators.`);
            return response.data;
        }
    } catch (e) { console.warn('[API] /operator/list failed:', e.message); }

    // Strategy 2: Fallback - Extract from Tickets (Scan deeper)
    try {
        console.log('[API] Attempting Operator Strategy 2: Extraction from recent tickets (Deep Scan)...');

        // Scan up to 5 pages of tickets to find operators
        for (let page = 1; page <= 5; page++) {
            try {
                const response = await tomticketRequest('/ticket/list', token, 'GET', { page: page, limit: 100 }); // Try fetching 100 tickets/page

                // Handle unwrapped vs wrapped data
                const tickets = response.data || response || [];

                if (Array.isArray(tickets) && tickets.length > 0) {
                    tickets.forEach(t => {
                        if (t.operator && t.operator.id) {
                            if (!operatorMap.has(t.operator.id)) {
                                operatorMap.set(t.operator.id, t.operator);
                                console.log(`[API] Found new operator: ${t.operator.name}`);
                            }
                        }
                    });
                } else {
                    break; // No more tickets
                }
            } catch (innerErr) {
                console.warn(`[API] Error scanning ticket page ${page} for operators:`, innerErr.message);
            }
        }

        operators = Array.from(operatorMap.values());
        console.log(`[API] Extracted total ${operators.length} unique operators from history.`);
    } catch (e) {
        console.error('[API] Fallback extraction failed:', e);
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

async function finalizeTicket(token, ticketId, message) {
    try {
        const params = {
            ticket_id: ticketId,
            message: message
        };
        const response = await tomticketRequest('/ticket/finish', token, 'POST', params);
        return response;
    } catch (error) {
        console.error(`API Error (Finalize Ticket ${ticketId}):`, error);
        throw error;
    }
}

async function linkAttendant(token, ticketId, operatorId) {
    try {
        const params = {
            ticket_id: ticketId,
            operator_id: operatorId
        };
        const response = await tomticketRequest('/ticket/operator/link', token, 'POST', params);
        return response;
    } catch (error) {
        console.error(`API Error (Link Attendant ${ticketId}):`, error);
        throw error;
    }
}

module.exports = { getTickets, getDepartments, getCategories, getCustomers, getOperators, createTicket, finalizeTicket, linkAttendant };
