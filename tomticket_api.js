const https = require('https');

const API_BASE_URL = 'https://api.tomticket.com/v2.0';

/**
 * Generic function to make API requests to TomTicket
 * @param {string} endpoint - The API endpoint (e.g., '/ticket/list')
 * @param {string} token - The user's API Token
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {object} params - Query parameters or body
 */
function tomticketRequest(endpoint, token, method = 'GET', params = {}) {
    return new Promise((resolve, reject) => {
        let url = `${API_BASE_URL}${endpoint}`;

        // Handle Query Params for GET
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
            // For form-data, we might need a library if JSON doesn't work.
            // But for 'ticket/list' (GET), this is fine.
            // req.write(JSON.stringify(params)); 
        }

        req.end();
    });
}

/**
 * Fetch tickets from TomTicket
 * @param {string} token - API Token
 * @param {object} filters - Filters like { operator_id: '...', situation: '0,1,2' }
 */
async function getTickets(token, filters = {}) {
    try {
        // Default filters to avoid fetching ancient history
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
 * Fetch Departments from TomTicket
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
 * Fetch Categories from TomTicket
 * Note: Provide department_id to filter, or fetch all if API allows (usually requires iterating deps)
 * TomTicket API usually requires department_id for categories.
 * We'll try fetching all by looping if needed, or if there is a 'list all' endpoint.
 * Docs say: GET /department/category/list?department_id=...
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
 * Fetch Customers
 * Limit to first 2 pages (approx 200 clients) to avoid freezing if there are thousands.
 * Or fetch specific search if API supports it, but for dropdown we need list.
 */
async function getCustomers(token) {
    try {
        // Fetch page 1
        const r1 = await tomticketRequest('/customer/list', token, 'GET', { page: 1 });
        let clients = r1.data || [];

        // Optional: Fetch more pages if needed, but keep it light for now
        // const r2 = await tomticketRequest('/customer/list', token, 'GET', { page: 2 });
        // if(r2.data) clients = clients.concat(r2.data);

        return clients;
    } catch (error) {
        console.error('API Error (Customers):', error);
        return [];
    }
}

module.exports = { getTickets, getDepartments, getCategories, getCustomers };
