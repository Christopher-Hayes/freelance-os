import { handleMcpRequest } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function routeHandler(request: Request) {
	const url = new URL(request.url);

	// Only handle /api/mcp
	if (!url.pathname.endsWith("/mcp")) {
		return new Response("Not found", { status: 404 });
	}

	// Only POST is valid for stateless Streamable HTTP
	if (request.method === "GET" || request.method === "DELETE") {
		return new Response(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Method not allowed." },
				id: null,
			}),
			{
				status: 405,
				headers: {
					Allow: "POST",
					"Content-Type": "application/json",
				},
			}
		);
	}

	return handleMcpRequest(request);
}

export { routeHandler as GET, routeHandler as POST, routeHandler as DELETE };