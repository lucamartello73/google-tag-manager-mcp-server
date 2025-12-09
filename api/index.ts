/**
 * Main API handler for Vercel serverless deployment
 * Minimal implementation for testing
 */

// CORS headers
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Main HTML page
function renderMainPage(): string {
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
      <h3><span class="method post">POST</span> MCP Endpoint</h3>
      <code>/mcp</code>
      <p>HTTP endpoint for MCP JSON-RPC requests.</p>
    </div>
    
    <h2>Documentation</h2>
    <p><a href="https://github.com/stape-io/google-tag-manager-mcp-server" target="_blank">GitHub Repository</a> | <a href="https://modelcontextprotocol.io" target="_blank">MCP Protocol</a></p>
    
    <footer>
      Powered by <a href="https://stape.io" target="_blank">Stape</a>
    </footer>
  </div>
</body>
</html>`;
}

// Main API handler - using any types to avoid import issues
export default async function handler(req: any, res: any) {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(200).end();
    }
    
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    
    // Get path from query parameter
    const path = (req.query?.path as string) || '';
    
    switch (path) {
      case '':
      case '/':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderMainPage());
      
      case 'authorize':
        return res.status(200).json({ 
          message: 'OAuth authorization endpoint',
          note: 'Provide client_id, redirect_uri, and state parameters'
        });
      
      case 'mcp':
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }
        return res.status(200).json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'google-tag-manager-mcp-server',
              version: '3.0.7',
            },
            capabilities: { tools: {} },
          },
          id: null
        });
      
      default:
        return res.status(404).json({ error: 'Not found', path });
    }
  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error?.message || 'Unknown error'
    });
  }
}
