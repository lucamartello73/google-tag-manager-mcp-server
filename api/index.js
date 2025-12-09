/**
 * Main API handler for Vercel serverless deployment
 * Full implementation with Google Tag Manager integration
 */

const { google } = require('googleapis');
const crypto = require('crypto');

// In-memory storage (for demo - use Vercel KV in production)
const memoryStore = new Map();

// Storage functions
async function storageGet(key) {
  const item = memoryStore.get(key);
  if (!item) return null;
  if (item.expiry && Date.now() > item.expiry) {
    memoryStore.delete(key);
    return null;
  }
  return item.value;
}

async function storageSet(key, value, ttl) {
  const item = { value };
  if (ttl) item.expiry = Date.now() + (ttl * 1000);
  memoryStore.set(key, item);
}

// Generate secure random strings
function generateCode(length = 32) {
  return crypto.randomBytes(length).toString('base64url');
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Get base URL
function getBaseUrl(req) {
  const host = req.headers.host || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

// Google OAuth scopes
const GOOGLE_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/tagmanager.manage.accounts',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.delete.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.manage.users',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/tagmanager.readonly',
];

// Main HTML page
function renderMainPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Tag Manager MCP Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #f5f5f5; }
    .container { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 0.5rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .endpoint { background: #f8f9fa; padding: 1rem; margin: 1rem 0; border-radius: 8px; border-left: 4px solid #4285f4; }
    .endpoint h3 { margin: 0 0 0.5rem 0; color: #333; }
    code { background: #e8f0fe; padding: 0.2rem 0.5rem; border-radius: 4px; font-family: 'Monaco', monospace; color: #1a73e8; }
    .method { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; margin-right: 0.5rem; }
    .get { background: #e6f4ea; color: #137333; }
    .post { background: #fce8e6; color: #c5221f; }
    a { color: #1a73e8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; color: #666; font-size: 0.9rem; }
    .status { display: inline-block; padding: 0.3rem 0.8rem; background: #e6f4ea; color: #137333; border-radius: 20px; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Google Tag Manager MCP Server</h1>
    <p class="subtitle">Model Context Protocol server for Google Tag Manager integration <span class="status">v3.0.7</span></p>
    
    <h2>API Endpoints</h2>
    
    <div class="endpoint">
      <h3><span class="method get">GET</span> OAuth Authorization</h3>
      <code>/authorize</code>
      <p>Initiate OAuth 2.0 flow with Google.</p>
    </div>
    
    <div class="endpoint">
      <h3><span class="method post">POST</span> Token Exchange</h3>
      <code>/token</code>
      <p>Exchange authorization code for access token.</p>
    </div>
    
    <div class="endpoint">
      <h3><span class="method post">POST</span> Client Registration</h3>
      <code>/register</code>
      <p>Dynamic OAuth client registration.</p>
    </div>
    
    <div class="endpoint">
      <h3><span class="method post">POST</span> MCP Endpoint</h3>
      <code>/mcp</code>
      <p>HTTP endpoint for MCP JSON-RPC requests.</p>
    </div>
    
    <h2>Documentation</h2>
    <p><a href="https://github.com/stape-io/google-tag-manager-mcp-server" target="_blank">GitHub Repository</a> | <a href="https://modelcontextprotocol.io" target="_blank">MCP Protocol</a></p>
    
    <footer>
      <a href="/privacy">Privacy Policy</a> | <a href="/terms">Terms of Service</a> | 
      Powered by <a href="https://stape.io" target="_blank">Stape</a>
    </footer>
  </div>
</body>
</html>`;
}

function renderPrivacyPage() {
  return `<!DOCTYPE html>
<html><head><title>Privacy Policy</title><style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem;}</style></head>
<body>
<h1>Privacy Policy</h1>
<p>This MCP server processes Google Tag Manager data on behalf of authorized users.</p>
<p>We only access the data necessary to perform the requested operations.</p>
<p>No data is stored permanently beyond the session.</p>
<p><a href="/">Back to Home</a></p>
</body></html>`;
}

function renderTermsPage() {
  return `<!DOCTYPE html>
<html><head><title>Terms of Service</title><style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem;}</style></head>
<body>
<h1>Terms of Service</h1>
<p>By using this MCP server, you agree to use it responsibly and in accordance with Google's Terms of Service.</p>
<p>This server is provided as-is without warranty.</p>
<p><a href="/">Back to Home</a></p>
</body></html>`;
}

// Google OAuth helpers
function getGoogleAuthUrl(baseUrl, state) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', `${baseUrl}/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  if (process.env.HOSTED_DOMAIN) {
    url.searchParams.set('hd', process.env.HOSTED_DOMAIN);
  }
  return url.toString();
}

async function exchangeGoogleCode(code, redirectUri) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  
  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token;
}

// Extract token from request
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7);
  return null;
}

// Simple MCP response helpers
function mcpError(id, code, message) {
  return { jsonrpc: '2.0', error: { code, message }, id };
}

function mcpResult(id, result) {
  return { jsonrpc: '2.0', result, id };
}

// GTM API helpers
function createTagManagerClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.tagmanager({ version: 'v2', auth });
}

// MCP Tools implementation
async function handleMcpRequest(body, accessToken) {
  const { method, params, id } = body;
  
  const tagmanager = createTagManagerClient(accessToken);
  
  try {
    switch (method) {
      case 'initialize':
        return mcpResult(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'google-tag-manager-mcp-server',
            version: '3.0.7',
          },
          capabilities: {
            tools: {},
          },
        });
      
      case 'tools/list':
        return mcpResult(id, {
          tools: [
            { name: 'gtm_list_accounts', description: 'List all GTM accounts', inputSchema: { type: 'object', properties: {} } },
            { name: 'gtm_list_containers', description: 'List containers in an account', inputSchema: { type: 'object', properties: { accountId: { type: 'string' } }, required: ['accountId'] } },
            { name: 'gtm_list_workspaces', description: 'List workspaces in a container', inputSchema: { type: 'object', properties: { accountId: { type: 'string' }, containerId: { type: 'string' } }, required: ['accountId', 'containerId'] } },
            { name: 'gtm_list_tags', description: 'List tags in a workspace', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
            { name: 'gtm_list_triggers', description: 'List triggers in a workspace', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
            { name: 'gtm_list_variables', description: 'List variables in a workspace', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
          ],
        });
      
      case 'tools/call':
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        
        switch (toolName) {
          case 'gtm_list_accounts': {
            const res = await tagmanager.accounts.list();
            return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(res.data.account || [], null, 2) }] });
          }
          
          case 'gtm_list_containers': {
            const res = await tagmanager.accounts.containers.list({ parent: `accounts/${toolArgs.accountId}` });
            return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(res.data.container || [], null, 2) }] });
          }
          
          case 'gtm_list_workspaces': {
            const res = await tagmanager.accounts.containers.workspaces.list({ 
              parent: `accounts/${toolArgs.accountId}/containers/${toolArgs.containerId}` 
            });
            return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(res.data.workspace || [], null, 2) }] });
          }
          
          case 'gtm_list_tags': {
            const res = await tagmanager.accounts.containers.workspaces.tags.list({ parent: toolArgs.path });
            return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(res.data.tag || [], null, 2) }] });
          }
          
          case 'gtm_list_triggers': {
            const res = await tagmanager.accounts.containers.workspaces.triggers.list({ parent: toolArgs.path });
            return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(res.data.trigger || [], null, 2) }] });
          }
          
          case 'gtm_list_variables': {
            const res = await tagmanager.accounts.containers.workspaces.variables.list({ parent: toolArgs.path });
            return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(res.data.variable || [], null, 2) }] });
          }
          
          default:
            return mcpError(id, -32601, `Unknown tool: ${toolName}`);
        }
      
      default:
        return mcpError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    return mcpError(id, -32603, error.message || 'Internal error');
  }
}

// Main API handler
module.exports = async function handler(req, res) {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).end();
    }
    
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    
    const baseUrl = getBaseUrl(req);
    const path = req.query.path || '';
    
    switch (path) {
      case '':
      case '/':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderMainPage());
      
      case 'privacy':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderPrivacyPage());
      
      case 'terms':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderTermsPage());
      
      case 'authorize': {
        const clientId = req.query.client_id || '';
        const redirectUri = req.query.redirect_uri || '';
        const state = req.query.state || '';
        
        if (!clientId || !redirectUri) {
          return res.status(400).json({ error: 'Missing client_id or redirect_uri' });
        }
        
        const authState = generateCode(16);
        await storageSet(`auth:${authState}`, JSON.stringify({ clientId, redirectUri, state }), 600);
        
        return res.redirect(302, getGoogleAuthUrl(baseUrl, authState));
      }
      
      case 'callback': {
        const code = req.query.code;
        const state = req.query.state;
        
        if (!code || !state) {
          return res.status(400).json({ error: 'Missing code or state' });
        }
        
        const stateData = await storageGet(`auth:${state}`);
        if (!stateData) {
          return res.status(400).json({ error: 'Invalid state' });
        }
        
        const { clientId, redirectUri, state: originalState } = JSON.parse(stateData);
        
        const accessToken = await exchangeGoogleCode(code, `${baseUrl}/callback`);
        if (!accessToken) {
          return res.status(400).json({ error: 'Failed to exchange code' });
        }
        
        // Get user info
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const user = await userRes.json();
        
        // Generate our own token
        const ourToken = generateCode(32);
        await storageSet(`token:${ourToken}`, JSON.stringify({ 
          accessToken, 
          userId: user.id, 
          name: user.name, 
          email: user.email,
          clientId 
        }), 3600);
        
        // Generate auth code for client
        const authCode = generateCode(32);
        await storageSet(`code:${authCode}`, JSON.stringify({ token: ourToken, clientId }), 300);
        
        const redirect = new URL(redirectUri);
        redirect.searchParams.set('code', authCode);
        if (originalState) redirect.searchParams.set('state', originalState);
        
        return res.redirect(302, redirect.toString());
      }
      
      case 'token': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        
        const { grant_type, code, client_id } = req.body || {};
        
        if (grant_type !== 'authorization_code' || !code) {
          return res.status(400).json({ error: 'invalid_request' });
        }
        
        const codeData = await storageGet(`code:${code}`);
        if (!codeData) {
          return res.status(400).json({ error: 'invalid_grant' });
        }
        
        const { token } = JSON.parse(codeData);
        
        return res.json({
          access_token: token,
          token_type: 'Bearer',
          expires_in: 3600,
        });
      }
      
      case 'register': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        
        const { redirect_uris, client_name } = req.body || {};
        
        const clientId = `gtm_${generateCode(16)}`;
        const clientSecret = generateCode(32);
        
        await storageSet(`client:${clientId}`, JSON.stringify({ 
          clientSecret, 
          redirectUris: redirect_uris, 
          name: client_name 
        }));
        
        return res.status(201).json({ client_id: clientId, client_secret: clientSecret });
      }
      
      case 'mcp': {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        
        const token = extractToken(req);
        if (!token) {
          return res.status(401).json(mcpError(null, -32600, 'Unauthorized'));
        }
        
        const tokenData = await storageGet(`token:${token}`);
        if (!tokenData) {
          return res.status(401).json(mcpError(null, -32600, 'Invalid token'));
        }
        
        const { accessToken } = JSON.parse(tokenData);
        const result = await handleMcpRequest(req.body, accessToken);
        return res.json(result);
      }
      
      case 'sse': {
        return res.json({ 
          message: 'SSE endpoint - Use /mcp for HTTP transport instead',
          note: 'Vercel serverless functions have timeout limits that make SSE impractical'
        });
      }
      
      default:
        return res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
