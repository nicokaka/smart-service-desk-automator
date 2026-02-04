const https = require('https');

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

        // Lidar com Parâmetros de Consulta para GET
        if (method === 'GET' && Object.keys(params).length > 0) {
            const query = new URLSearchParams(params).toString();
            url += `?${query}`;
        }

        const options = {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json' // Although docs say form-data, JSON is usually accepted. We'll test. Docs say form-data for POST.
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`API Error ${res.statusCode}: ${parsed.message || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (method !== 'GET' && params) {
            // Para form-data, podemos precisar de uma biblioteca se JSON não funcionar.
            // Mas para 'ticket/list' (GET), isso serve.
            // req.write(JSON.stringify(params)); 
        }

        req.end();
    });
}

/**
 * Buscar chamados do TomTicket
 * @param {string} token - API Token
 * @param {object} filters - Filtros como { operator_id: '...', situation: '0,1,2' }
 */
async function getTickets(token, filters = {}) {
    try {
        // Filtros padrão para evitar buscar histórico antigo
        const defaultFilters = {
            'page': 1,
            'situation': '0,1,2,3,6,7,8,9,10,11' // Open tickets mostly
        };
        const finalParams = { ...defaultFilters, ...filters };

        console.log('Fetching tickets with params:', finalParams);
        const response = await tomticketRequest('/ticket/list', token, 'GET', finalParams);

        // Response format usually { data: [...] } or just [...] depending on API
        return response;
    } catch (error) {
        console.error('TomTicket API Error:', error);
        throw error;
    }
}

/**
 * Buscar Departamentos do TomTicket
 */
async function getDepartments(token) {
    try {
        const response = await tomticketRequest('/department/list', token, 'GET');
        return response.data || [];
    } catch (error) {
        console.error('API Error (Departments):', error);
        return [];
    }
}

/**
 * Buscar Categorias do TomTicket
 * Nota: Forneça department_id para filtrar, ou busque todos se a API permitir (geralmente requer iterar deptos)
 * API do TomTicket geralmente requer department_id para categorias.
 * Vamos tentar buscar tudo fazendo loop se necessário, ou se houver um endpoint 'listar tudo'.
 * Docs dizem: GET /department/category/list?department_id=...
 */
async function getCategories(token, departmentId) {
    try {
        const response = await tomticketRequest('/department/category/list', token, 'GET', { department_id: departmentId });
        return response.data || [];
    } catch (error) {
        console.error(`API Error (Categories for ${departmentId}):`, error);
        return [];
    }
}

/**
 * Buscar Clientes
 * Limitar às primeiras 2 páginas (aprox 200 clientes) para evitar travamento se houver milhares.
 * Ou buscar pesquisa específica se a API suportar, mas para o dropdown precisamos da lista.
 */
async function getCustomers(token) {
    try {
        // Buscar página 1
        const r1 = await tomticketRequest('/customer/list', token, 'GET', { page: 1 });
        let clients = r1.data || [];

        // Opcional: Buscar mais páginas se necessário, mas manter leve por enquanto
        // const r2 = await tomticketRequest('/customer/list', token, 'GET', { page: 2 });
        // if(r2.data) clients = clients.concat(r2.data);

        return clients;
    } catch (error) {
        console.error('API Error (Customers):', error);
        return [];
    }
}

module.exports = { getTickets, getDepartments, getCategories, getCustomers };
