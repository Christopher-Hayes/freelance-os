export type McpAuthContext = {
	userId: string;
	userEmail: string | null;
	userName: string | null;
	permissions: string[];
	apiKeyId?: string;
	isPasswordAuth?: boolean;
};

export type McpStructuredResult = Record<string, unknown>;

export type McpToolSuccessResult = {
	content: Array<{ type: "text"; text: string }>;
	structuredContent?: McpStructuredResult;
	_meta?: Record<string, unknown>;
};

export type McpToolErrorResult = McpToolSuccessResult & {
	isError: true;
};

export type McpToolContext = {
	auth: McpAuthContext;
	requestId?: string | number;
};