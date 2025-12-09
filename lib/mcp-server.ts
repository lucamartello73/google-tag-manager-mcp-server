/**
 * MCP Server wrapper for Vercel
 * Provides MCP protocol handling without Cloudflare Workers dependencies
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { tools } from "../src/tools";
import { McpAgentPropsModel, McpAgentToolParamsModel } from "../src/models/McpAgentModel";
import { UserProps } from "./oauth";

// Version from package.json
const PACKAGE_VERSION = "3.0.4";

export interface MCPContext {
  props: McpAgentPropsModel;
  env: NodeJS.ProcessEnv;
}

export function createMcpServer(): McpServer {
  return new McpServer({
    name: "google-tag-manager-mcp-server",
    version: PACKAGE_VERSION,
    vendor: "stape-io",
    homepage: "https://github.com/stape-io/google-tag-manager-mcp-server",
  });
}

export function registerTools(server: McpServer, context: MCPContext): void {
  const toolParams: McpAgentToolParamsModel = {
    props: context.props,
    env: context.env as unknown as Env,
  };
  
  tools.forEach((registerTool) => {
    registerTool(server, toolParams);
  });
}

export function createMcpContext(userProps: UserProps): MCPContext {
  return {
    props: {
      userId: userProps.userId,
      name: userProps.name,
      email: userProps.email,
      accessToken: userProps.accessToken,
      clientId: userProps.clientId,
    },
    env: process.env,
  };
}

// SSE handler for Vercel
export async function handleSSE(
  req: ExpressRequest,
  res: ExpressResponse,
  userProps: UserProps,
): Promise<void> {
  const server = createMcpServer();
  const context = createMcpContext(userProps);
  registerTools(server, context);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Create SSE transport
  const transport = new SSEServerTransport('/sse', res);
  
  await server.connect(transport);
  
  // Handle client disconnect
  req.on('close', async () => {
    await server.close();
  });
}

// HTTP Streamable handler for Vercel
export async function handleMCP(
  req: ExpressRequest,
  res: ExpressResponse,
  userProps: UserProps,
): Promise<void> {
  const server = createMcpServer();
  const context = createMcpContext(userProps);
  registerTools(server, context);
  
  // Create Streamable HTTP transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  });
  
  await server.connect(transport);
  
  // Handle the request
  const body = req.body;
  
  try {
    const response = await transport.handleRequest(req, res, body);
    if (response) {
      res.json(response);
    }
  } catch (error) {
    console.error('MCP request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
  
  // Cleanup
  await server.close();
}

// JSON-RPC handler for direct HTTP calls
export async function handleJSONRPC(
  req: ExpressRequest,
  res: ExpressResponse,
  userProps: UserProps,
): Promise<void> {
  const server = createMcpServer();
  const context = createMcpContext(userProps);
  registerTools(server, context);
  
  const body = req.body;
  
  if (!body || !body.method) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: body?.id || null,
    });
    return;
  }
  
  try {
    // Forward to MCP server
    const result = await server.request(body, {});
    res.json({
      jsonrpc: '2.0',
      result,
      id: body.id,
    });
  } catch (error) {
    console.error('JSON-RPC error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: body?.id || null,
    });
  }
}
