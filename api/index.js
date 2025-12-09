/**
 * Main API handler for Vercel serverless deployment
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Main HTML page
function renderMainPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Tag Manager MCP Server</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
    .container { background: #f5f5f5; padding: 2rem; border-radius: 12px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Google Tag Manager MCP Server</h1>
    <p>MCP server for Google Tag Manager integration v3.0.7</p>
    <h2>Endpoints</h2>
    <ul>
      <li><code>/authorize</code> - OAuth</li>
      <li><code>/mcp</code> - MCP JSON-RPC</li>
    </ul>
  </div>
</body>
</html>`;
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
    
    // Get path from query parameter
    const path = req.query.path || '';
    
    switch (path) {
      case '':
      case '/':
        return res.setHeader('Content-Type', 'text/html').status(200).send(renderMainPage());
      
      case 'authorize':
        return res.status(200).json({ message: 'OAuth endpoint' });
      
      case 'mcp':
        return res.status(200).json({
          jsonrpc: '2.0',
          result: { serverInfo: { name: 'gtm-mcp', version: '3.0.7' } },
          id: null
        });
      
      default:
        return res.status(404).json({ error: 'Not found', path });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
