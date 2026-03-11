import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerAdminMcpTools } from "./tools";
import { getMcpAuthInfo } from "./auth";

/**
 * Creates a fresh MCP server instance with all tools registered.
 * In stateless mode we create a new server per request (cheap — just object assignment).
 */
function createServer(): McpServer {
	const server = new McpServer(
		{
			name: "freelance-os-admin-dashboard",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	registerAdminMcpTools(server);
	return server;
}

/**
 * Handles an MCP request directly using the SDK's web-standard transport.
 * No Node ServerResponse bridging — returns a web Response natively.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
	// --- Auth ---
	const authInfo = await getMcpAuthInfo();
	if (!authInfo) {
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32001, message: "Unauthorized: valid API key with mcp:use permission required" },
				id: null,
			}),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	if (!authInfo.scopes.includes("mcp:use")) {
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32001, message: "Forbidden: mcp:use permission required" },
				id: null,
			}),
			{
				status: 403,
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	// --- Transport + Server (per-request, stateless) ---
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});

	const server = createServer();

	try {
		await server.connect(transport);
		const response = await transport.handleRequest(request, {
			authInfo,
		});

		return response;
	} catch (error) {
		console.error("[MCP] Transport error:", error);
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32603, message: "Internal server error" },
				id: null,
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
}