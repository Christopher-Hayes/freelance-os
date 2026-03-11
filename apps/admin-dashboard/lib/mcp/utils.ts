import { hasPermission } from "@/lib/auth";
import type { McpStructuredResult, McpToolContext, McpToolErrorResult, McpToolSuccessResult } from "./types";

function toJsonSafeValue(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === "bigint") {
		return value.toString();
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map((item) => toJsonSafeValue(item));
	}

	if (typeof value === "object") {
		const candidate = value as {
			toJSON?: () => unknown;
			toISOString?: () => string;
			constructor?: { name?: string };
		};

		if (typeof candidate.toJSON === "function" && candidate.constructor?.name !== "Object") {
			return toJsonSafeValue(candidate.toJSON());
		}

		if (typeof candidate.toISOString === "function") {
			return candidate.toISOString();
		}

		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, toJsonSafeValue(nestedValue)])
		);
	}

	return value;
}

export function toJsonSafeStructuredContent(
	structuredContent?: McpStructuredResult
): McpStructuredResult | undefined {
	if (!structuredContent) {
		return undefined;
	}

	return toJsonSafeValue(structuredContent) as McpStructuredResult;
}

export function requireMcpPermission(context: McpToolContext, permission: string): void {
	if (!hasPermission(context.auth, "mcp:use")) {
		throw new Error("Missing permission: mcp:use");
	}

	if (!hasPermission(context.auth, permission)) {
		throw new Error(`Missing permission: ${permission}`);
	}
}

export function createTextResult(text: string, structuredContent?: McpStructuredResult): McpToolSuccessResult {
	return {
		content: [{ type: "text", text }],
		structuredContent: toJsonSafeStructuredContent(structuredContent),
	};
}

export function createErrorResult(message: string, structuredContent?: McpStructuredResult): McpToolErrorResult {
	return {
		content: [{ type: "text", text: message }],
		structuredContent: toJsonSafeStructuredContent(structuredContent),
		isError: true,
	};
}