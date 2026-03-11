import { createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@freelance-os/database";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { normalizeAdminPermissions } from "@/lib/auth";
import type { McpAuthContext } from "./types";

export async function getMcpAuth(): Promise<McpAuthContext | null> {
	const setting = await prisma.setting.findUnique({
		where: { key: "main" },
		select: { mcpEnabled: true },
	});

	if (setting?.mcpEnabled === false) {
		return null;
	}

	const headersList = await headers();
	const authorization = headersList.get("authorization");

	if (!authorization) {
		return null;
	}

	const match = authorization.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1];
	if (!token) {
		return null;
	}

	const hashedKey = createHash("sha256").update(token).digest("hex");
	const apiKey = await prisma.apiKey.findUnique({
		where: { key: hashedKey },
		include: {
			user: {
				select: {
					id: true,
					email: true,
					name: true,
					clientId: true,
				},
			},
		},
	});

	if (!apiKey) {
		return null;
	}

	if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
		return null;
	}

	if (apiKey.user.clientId !== null) {
		return null;
	}

	prisma.apiKey
		.update({
			where: { id: apiKey.id },
			data: { lastUsedAt: new Date() },
		})
		.catch((error) => console.error("Failed to update MCP API key usage:", error));

	return {
		userId: apiKey.user.id,
		userEmail: apiKey.user.email,
		userName: apiKey.user.name,
		permissions: normalizeAdminPermissions(apiKey.permissions),
		apiKeyId: apiKey.id,
	};
}

export async function getMcpAuthInfo(): Promise<AuthInfo | undefined> {
	const auth = await getMcpAuth();
	if (!auth) {
		return undefined;
	}

	return {
		token: auth.apiKeyId ?? auth.userId,
		clientId: auth.userId,
		extra: auth,
		scopes: auth.permissions,
	};
}