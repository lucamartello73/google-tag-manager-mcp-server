/**
 * Main API handler for Vercel serverless deployment
 * Handles OAuth, MCP, and SSE endpoints
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
  parseAuthRequest, 
  completeAuthorization, 
  exchangeCode,
  registerClient,
  lookupClient,
  validateToken,
  getUpstreamAuthorizeUrl,
  fetchUpstreamAuthToken,
  listUserGrants,
  revokeGrant,
  deleteOAuthClient,
  UserProps,
} from '../lib/oauth';
import { handleSSE, handleMCP, handleJSONRPC } from '../lib/mcp-server';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Get base URL from environment or request
function getBaseUrl(req: VercelRequest): string {
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
function renderMainPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Tag Manager MCP Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    h1 { color: #333; }
    .endpoint { background: #f5f5f5; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    code { background: #e0e0e0; padding: 0.2rem 0.5rem; border-radius: 4px; }
    a { color: #0066cc; }
  </style>
</head>
<body>
  <h1>Google Tag Manager MCP Server</h1>
  <p>MCP (Model Context Protocol) server for Google Tag Manager integration.</p>
  
  <h2>Endpoints</h2>
  <div class="endpoint">
    <h3>SSE Endpoint</h3>
    <code>GET /api?path=sse</code>
    <p>Server-Sent Events endpoint for real-time MCP communication.</p>
  </div>
  
  <div class="endpoint">
    <h3>MCP Endpoint</h3>
    <code>POST /api?path=mcp</code>
    <p>Streamable HTTP endpoint for MCP requests.</p>
  </div>
  
  <div class="endpoint">
    <h3>OAuth Authorization</h3>
    <code>GET /api?path=authorize</code>
    <p>OAuth 2.0 authorization endpoint.</p>
  </div>
  
  <div class="endpoint">
    <h3>OAuth Token</h3>
    <code>POST /api?path=token</code>
    <p>OAuth 2.0 token endpoint.</p>
  </div>
  
  <div class="endpoint">
    <h3>Client Registration</h3>
    <code>POST /api?path=register</code>
    <p>Dynamic client registration endpoint.</p>
  </div>
  
  <h2>Documentation</h2>
  <p><a href="https://github.com/stape-io/google-tag-manager-mcp-server">GitHub Repository</a></p>
  
  <footer style="margin-top: 2rem; color: #666;">
    <a href="/api?path=privacy">Privacy Policy</a> | 
    <a href="/api?path=terms">Terms of Service</a>
  </footer>
</body>
</html>`;
}

// Privacy page
function renderPrivacyPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Privacy Policy</title></head>
<body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem;">
<h1>Privacy Policy</h1>
<p>This MCP server processes Google Tag Manager data on behalf of authorized users.</p>
<p>We only access the data necessary to perform the requested operations.</p>
<p>No data is stored permanently beyond the session.</p>
</body></html>`;
}

// Terms page
function renderTermsPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Terms of Service</title></head>
<body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem;">
<h1>Terms of Service</h1>
<p>By using this MCP server, you agree to use it responsibly and in accordance with Google's Terms of Service.</p>
<p>This server is provided as-is without warranty.</p>
</body></html>`;
}

// Extract authorization from request
async function extractAuth(req: VercelRequest): Promise<UserProps | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  return validateToken(token);
}

// Main API handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  const url = new URL(req.url || '/', getBaseUrl(req));
  const path = url.searchParams.get('path') || req.query.path || '';
  const baseUrl = getBaseUrl(req);
  
  try {
    // Route handling
    switch (path) {
      case '':
      case '/':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderMainPage());
      
      case 'privacy':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderPrivacyPage());
      
      case 'terms':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderTermsPage());
      
      case 'authorize':
        return handleAuthorize(req, res, baseUrl);
      
      case 'callback':
        return handleCallback(req, res, baseUrl);
      
      case 'token':
        return handleToken(req, res);
      
      case 'register':
        return handleRegister(req, res);
      
      case 'sse':
        return handleSSEEndpoint(req, res);
      
      case 'mcp':
        return handleMCPEndpoint(req, res);
      
      case 'remove':
        return handleRemove(req, res);
      
      default:
        return res.status(404).json({ error: 'Not found' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Authorization endpoint
async function handleAuthorize(req: VercelRequest, res: VercelResponse, baseUrl: string) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const url = new URL(req.url || '/', baseUrl);
  const authRequest = await parseAuthRequest(url);
  
  if (!authRequest.clientId) {
    return res.status(400).json({ error: 'Invalid request: missing client_id' });
  }
  
  // Redirect to Google OAuth
  const googleAuthUrl = getUpstreamAuthorizeUrl({
    upstreamUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: GOOGLE_SCOPES.join(' '),
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    redirectUri: `${baseUrl}/api?path=callback`,
    state: Buffer.from(JSON.stringify(authRequest)).toString('base64'),
    hostedDomain: process.env.HOSTED_DOMAIN,
  });
  
  return res.redirect(302, googleAuthUrl);
}

// OAuth callback endpoint
async function handleCallback(req: VercelRequest, res: VercelResponse, baseUrl: string) {
  const url = new URL(req.url || '/', baseUrl);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  
  if (!code || !stateParam) {
    return res.status(400).json({ error: 'Missing code or state' });
  }
  
  let authRequest;
  try {
    authRequest = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'));
  } catch {
    return res.status(400).json({ error: 'Invalid state' });
  }
  
  // Exchange code with Google
  const [accessToken, errorResponse] = await fetchUpstreamAuthToken({
    upstreamUrl: 'https://accounts.google.com/o/oauth2/token',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    code,
    redirectUri: `${baseUrl}/api?path=callback`,
    grantType: 'authorization_code',
  });
  
  if (errorResponse || !accessToken) {
    return res.status(400).json({ error: 'Failed to exchange code' });
  }
  
  // Get user info from Google
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!userResponse.ok) {
    return res.status(500).json({ error: 'Failed to fetch user info' });
  }
  
  const { id, name, email } = await userResponse.json() as { id: string; name: string; email: string };
  
  // Complete authorization
  const { redirectTo } = await completeAuthorization({
    request: authRequest,
    userId: id,
    metadata: { label: name },
    scope: authRequest.scope || GOOGLE_SCOPES,
    props: {
      userId: id,
      name,
      email,
      accessToken,
      clientId: authRequest.clientId,
    },
  });
  
  return res.redirect(302, redirectTo);
}

// Token endpoint
async function handleToken(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const body = req.body || {};
  const { grant_type, code, client_id, client_secret } = body;
  
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  
  if (!code || !client_id) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  const result = await exchangeCode(code, client_id);
  
  if (!result) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  
  return res.json({
    access_token: result.accessToken,
    token_type: result.tokenType,
    expires_in: result.expiresIn,
    scope: result.scope,
  });
}

// Client registration endpoint
async function handleRegister(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const body = req.body || {};
  const { redirect_uris, client_name } = body;
  
  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }
  
  const { clientId, clientSecret } = await registerClient({
    redirectUris: redirect_uris,
    name: client_name || 'MCP Client',
  });
  
  return res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris,
    client_name,
  });
}

// SSE endpoint
async function handleSSEEndpoint(req: VercelRequest, res: VercelResponse) {
  const userProps = await extractAuth(req);
  
  if (!userProps) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Note: Vercel has limitations with long-running connections
  // Consider using a different approach for production SSE
  try {
    await handleSSE(req as any, res as any, userProps);
  } catch (error) {
    console.error('SSE Error:', error);
    return res.status(500).json({ error: 'SSE connection failed' });
  }
}

// MCP endpoint
async function handleMCPEndpoint(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const userProps = await extractAuth(req);
  
  if (!userProps) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    await handleJSONRPC(req as any, res as any, userProps);
  } catch (error) {
    console.error('MCP Error:', error);
    return res.status(500).json({ error: 'MCP request failed' });
  }
}

// Remove endpoint (revoke access)
async function handleRemove(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const userId = url.searchParams.get('userId');
  const clientId = url.searchParams.get('clientId');
  const accessToken = url.searchParams.get('accessToken');
  
  if (!userId || !clientId || !accessToken) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  
  // Revoke all grants
  const grants = await listUserGrants(userId);
  await Promise.all(grants.map(grant => revokeGrant(grant.id, grant.userId)));
  
  // Delete client
  await deleteOAuthClient(clientId);
  
  // Revoke Google token
  await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  
  return res.status(200).json({ status: 'OK' });
}
