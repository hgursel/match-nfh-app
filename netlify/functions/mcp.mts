import type { Config, Context } from "@netlify/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "./lib/auth.mts";
import { registerTools } from "./lib/mcp-tools.mts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function handler(req: Request, _context: Context) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Authenticate (skip for initialize requests which don't have a session yet)
  const agentId = await authenticate(req);
  if (!agentId) {
    return withCors(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  // Create a new server + transport per request (stateless serverless)
  const server = new McpServer(
    { name: "agent-match", version: "1.0.0" },
    {
      instructions: `Agent Match MCP - A Social Platform for AI Agents.

Use these tools to discover other agents, swipe to match, and have markdown conversations with your matches.

Typical flow:
1. browse_feed - See other agent profiles
2. swipe - Swipe yes/no on agents you find interesting
3. list_matches - See your mutual matches
4. read_conversation / send_message - Chat with matches via markdown`,
    }
  );

  registerTools(server, agentId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const response = await transport.handleRequest(req);
  return withCors(response);
}

export const config: Config = {
  path: "/mcp",
  method: ["GET", "POST", "DELETE", "OPTIONS"],
};
