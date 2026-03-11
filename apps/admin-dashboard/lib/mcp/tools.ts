import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { prisma } from "@freelance-os/database";
import { createErrorResult, createTextResult, requireMcpPermission } from "./utils";
import type { McpToolContext } from "./types";
import { generateWeeklySummary } from "@/lib/ai-actions";

const noArgsSchema = z.object({}).strict();

function logToolError(toolName: string, error: unknown, requestId?: string | number) {
	console.error(`[MCP] Tool ${toolName} failed`, {
		requestId,
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
	});
}

function serializeInvoices<T extends { amount: { toNumber(): number } }>(invoices: T[]) {
	return invoices.map((invoice) => ({
		...invoice,
		amount: invoice.amount.toNumber(),
	}));
}

export function registerAdminMcpTools(server: McpServer) {
	const getContext = (extra: RequestHandlerExtra<ServerRequest, ServerNotification>): McpToolContext => ({
		auth: ((extra.authInfo?.extra as McpToolContext["auth"] | undefined) ?? {
			userId: "unknown",
			userEmail: null,
			userName: null,
			permissions: [],
		}) as McpToolContext["auth"],
		requestId: extra.requestId,
	});

	server.registerTool(
		"clients_list",
		{ description: "List all clients in the admin dashboard.", inputSchema: noArgsSchema },
		async (_args: Record<string, never>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:clients");
				const clients = await prisma.client.findMany({
					orderBy: { name: "asc" },
					include: {
						_count: { select: { projects: true, invoices: true } },
					},
				});

				return createTextResult(`Found ${clients.length} clients.`, { clients, count: clients.length });
			} catch (error) {
				logToolError("clients_list", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to list clients");
			}
		}
	);

	server.registerTool(
		"clients_create",
		{
			description: "Create a new client.",
			inputSchema: z.object({
			name: z.string().min(1),
			email: z.string().email(),
			company: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:clients");
				const existingClient = await prisma.client.findUnique({ where: { email: args.email } });
				if (existingClient) {
					return createErrorResult(`A client with email ${args.email} already exists.`, {
						email: args.email,
					});
				}

				const client = await prisma.client.create({
					data: {
						name: args.name,
						email: args.email,
						company: args.company ?? null,
					},
				});

				return createTextResult(`Created client ${client.name}.`, { client });
			} catch (error) {
				logToolError("clients_create", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to create client");
			}
		}
	);

	server.registerTool(
		"clients_update",
		{
			description: "Update an existing client.",
			inputSchema: z.object({
			id: z.number().int().positive(),
			name: z.string().min(1),
			email: z.string().email(),
			company: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:clients");

				const existingClient = await prisma.client.findUnique({
					where: { id: args.id },
				});

				if (!existingClient) {
					return createErrorResult(`Client ${args.id} not found.`, { clientId: args.id });
				}

				if (args.email !== existingClient.email) {
					const emailTaken = await prisma.client.findUnique({
						where: { email: args.email },
					});

					if (emailTaken) {
						return createErrorResult(`A client with email ${args.email} already exists.`, {
							email: args.email,
						});
					}
				}

				const client = await prisma.client.update({
					where: { id: args.id },
					data: {
						name: args.name,
						email: args.email,
						company: args.company || null,
					},
					include: {
						projects: {
							orderBy: { createdAt: "desc" },
						},
						invoices: {
							orderBy: { issueDate: "desc" },
						},
						_count: {
							select: {
								projects: true,
								invoices: true,
							},
						},
					},
				});

				return createTextResult(`Updated client ${client.name}.`, { client });
			} catch (error) {
				logToolError("clients_update", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to update client");
			}
		}
	);

	server.registerTool(
		"projects_list",
		{
			description: "List projects, optionally filtered by client or status.",
			inputSchema: z.object({
			clientId: z.number().int().positive().optional(),
			status: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:projects");
				const where: Record<string, unknown> = {};
				if (args.clientId) where.clientId = args.clientId;
				if (args.status) where.status = args.status;

				const projects = await prisma.project.findMany({
					where,
					include: {
						client: { select: { id: true, name: true, email: true } },
						_count: { select: { timeEntries: true } },
					},
					orderBy: { createdAt: "desc" },
				});

				return createTextResult(`Found ${projects.length} projects.`, { projects, count: projects.length });
			} catch (error) {
				logToolError("projects_list", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to list projects");
			}
		}
	);

	server.registerTool(
		"projects_create",
		{
			description: "Create a new project for a client.",
			inputSchema: z.object({
			name: z.string().min(1),
			clientId: z.number().int().positive(),
			clientDescription: z.string().optional(),
			privateNotes: z.string().optional(),
			status: z.string().optional(),
			color: z.string().optional(),
			billable: z.boolean().optional(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:projects");
				const client = await prisma.client.findUnique({ where: { id: args.clientId } });
				if (!client) {
					return createErrorResult(`Client ${args.clientId} not found.`, { clientId: args.clientId });
				}

				const project = await prisma.project.create({
					data: {
						name: args.name,
						clientId: args.clientId,
						clientDescription: args.clientDescription,
						privateNotes: args.privateNotes,
						status: args.status ?? "active",
						color: args.color ?? "#22C55E",
						billable: args.billable ?? true,
						startDate: args.startDate ? new Date(args.startDate) : null,
						endDate: args.endDate ? new Date(args.endDate) : null,
					},
					include: {
						client: { select: { id: true, name: true, email: true } },
					},
				});

				return createTextResult(`Created project ${project.name}.`, { project });
			} catch (error) {
				logToolError("projects_create", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to create project");
			}
		}
	);

	server.registerTool(
		"projects_update",
		{
			description: "Update an existing project.",
			inputSchema: z.object({
			id: z.number().int().positive(),
			name: z.string().min(1).optional(),
			clientId: z.number().int().positive().optional(),
			clientDescription: z.string().optional(),
			privateNotes: z.string().optional(),
			status: z.string().optional(),
			color: z.string().optional(),
			billable: z.boolean().optional(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:projects");

				const existingProject = await prisma.project.findUnique({
					where: { id: args.id },
				});

				if (!existingProject) {
					return createErrorResult(`Project ${args.id} not found.`, { projectId: args.id });
				}

				if (args.clientId && args.clientId !== existingProject.clientId) {
					const client = await prisma.client.findUnique({
						where: { id: args.clientId },
					});

					if (!client) {
						return createErrorResult(`Client ${args.clientId} not found.`, { clientId: args.clientId });
					}
				}

				const updateData: Record<string, unknown> = {};
				if (args.name !== undefined) updateData.name = args.name;
				if (args.clientDescription !== undefined) updateData.clientDescription = args.clientDescription;
				if (args.privateNotes !== undefined) updateData.privateNotes = args.privateNotes;
				if (args.status !== undefined) updateData.status = args.status;
				if (args.color !== undefined) updateData.color = args.color;
				if (args.billable !== undefined) updateData.billable = args.billable;
				if (args.startDate !== undefined) {
					updateData.startDate = args.startDate ? new Date(args.startDate) : null;
				}
				if (args.endDate !== undefined) {
					updateData.endDate = args.endDate ? new Date(args.endDate) : null;
				}
				if (args.clientId !== undefined) {
					updateData.client = {
						connect: { id: args.clientId },
					};
				}

				const project = await prisma.project.update({
					where: { id: args.id },
					data: updateData,
					include: {
						client: { select: { id: true, name: true, email: true } },
					},
				});

				return createTextResult(`Updated project ${project.name}.`, { project });
			} catch (error) {
				logToolError("projects_update", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to update project");
			}
		}
	);

	server.registerTool(
		"invoices_list",
		{
			description: "List invoices, optionally filtered by client, project, or status.",
			inputSchema: z.object({
			clientId: z.number().int().positive().optional(),
			projectId: z.number().int().positive().optional(),
			status: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:invoices");
				const where: Record<string, unknown> = {};
				if (args.clientId) where.clientId = args.clientId;
				if (args.projectId) where.projectId = args.projectId;
				if (args.status) where.status = args.status;

				const invoices = await prisma.invoice.findMany({
					where,
					include: {
						client: { select: { id: true, name: true, email: true, company: true } },
						project: { select: { id: true, name: true } },
					},
					orderBy: { issueDate: "desc" },
				});

				const serializedInvoices = serializeInvoices(invoices);
				return createTextResult(`Found ${serializedInvoices.length} invoices.`, {
					invoices: serializedInvoices,
					count: serializedInvoices.length,
				});
			} catch (error) {
				logToolError("invoices_list", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to list invoices");
			}
		}
	);

	server.registerTool(
		"time_list",
		{
			description: "List time entries, optionally filtered by project, client, or date range.",
			inputSchema: z.object({
			projectId: z.number().int().positive().optional(),
			clientId: z.number().int().positive().optional(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:time");
				const where: Record<string, unknown> = {};
				if (args.projectId) where.projectId = args.projectId;
				if (args.clientId) where.project = { clientId: args.clientId };

				if (args.startDate || args.endDate) {
					const startTimeFilter: Record<string, Date> = {};
					if (args.startDate) startTimeFilter.gte = new Date(`${args.startDate}T00:00:00.000Z`);
					if (args.endDate) startTimeFilter.lte = new Date(`${args.endDate}T23:59:59.999Z`);
					where.startTime = startTimeFilter;
				}

				const timeEntries = await prisma.timeEntry.findMany({
					where,
					include: {
						project: {
							include: {
								client: true,
							},
						},
					},
					orderBy: { startTime: "desc" },
					take: 100,
				});

				const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
				return createTextResult(`Found ${timeEntries.length} time entries.`, {
					timeEntries,
					summary: {
						count: timeEntries.length,
						totalMinutes,
						totalHours: Math.round((totalMinutes / 60) * 100) / 100,
					},
				});
			} catch (error) {
				logToolError("time_list", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to list time entries");
			}
		}
	);

	server.registerTool(
		"time_create",
		{
			description: "Create a time entry for a project.",
			inputSchema: z.object({
			projectId: z.number().int().positive(),
			startTime: z.string().min(1),
			endTime: z.string().min(1),
			durationMinutes: z.number().int().positive(),
			description: z.string().optional(),
			billable: z.boolean().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:time");
				const project = await prisma.project.findUnique({ where: { id: args.projectId } });
				if (!project) {
					return createErrorResult(`Project ${args.projectId} not found.`, { projectId: args.projectId });
				}

				const startTime = new Date(args.startTime.replace(/\[.*?\]$/, ""));
				const endTime = new Date(args.endTime.replace(/\[.*?\]$/, ""));
				if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
					return createErrorResult("Invalid ISO datetime supplied for startTime or endTime.");
				}

				const timeEntry = await prisma.timeEntry.create({
					data: {
						projectId: args.projectId,
						startTime,
						endTime,
						durationMinutes: args.durationMinutes,
						description: args.description ?? null,
						billable: args.billable ?? true,
					},
					include: {
						project: {
							include: { client: true },
						},
					},
				});

				return createTextResult(`Created time entry ${timeEntry.id}.`, { timeEntry });
			} catch (error) {
				logToolError("time_create", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to create time entry");
			}
		}
	);

	server.registerTool(
		"time_update",
		{
			description: "Update an existing time entry.",
			inputSchema: z.object({
			id: z.number().int().positive(),
			projectId: z.number().int().positive().optional(),
			startTime: z.string().min(1).optional(),
			endTime: z.string().min(1).optional(),
			durationMinutes: z.number().int().positive().optional(),
			description: z.string().optional(),
			billable: z.boolean().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:time");

				const existingEntry = await prisma.timeEntry.findUnique({
					where: { id: args.id },
				});

				if (!existingEntry) {
					return createErrorResult(`Time entry ${args.id} not found.`, { timeEntryId: args.id });
				}

				if (args.projectId && args.projectId !== existingEntry.projectId) {
					const project = await prisma.project.findUnique({
						where: { id: args.projectId },
					});

					if (!project) {
						return createErrorResult(`Project ${args.projectId} not found.`, { projectId: args.projectId });
					}
				}

				const updateData: Record<string, unknown> = {};
				if (args.projectId !== undefined) updateData.projectId = args.projectId;
				if (args.durationMinutes !== undefined) updateData.durationMinutes = args.durationMinutes;
				if (args.description !== undefined) updateData.description = args.description;
				if (args.billable !== undefined) updateData.billable = args.billable;

				if (args.startTime !== undefined) {
					const startTime = new Date(args.startTime.replace(/\[.*?\]$/, ""));
					if (Number.isNaN(startTime.getTime())) {
						return createErrorResult("Invalid startTime format. Expected ISO 8601 string.");
					}
					updateData.startTime = startTime;
				}

				if (args.endTime !== undefined) {
					const endTime = new Date(args.endTime.replace(/\[.*?\]$/, ""));
					if (Number.isNaN(endTime.getTime())) {
						return createErrorResult("Invalid endTime format. Expected ISO 8601 string.");
					}
					updateData.endTime = endTime;
				}

				const timeEntry = await prisma.timeEntry.update({
					where: { id: args.id },
					data: updateData,
					include: {
						project: {
							include: { client: true },
						},
					},
				});

				return createTextResult(`Updated time entry ${timeEntry.id}.`, {
					timeEntry: {
						...timeEntry,
						startTime: timeEntry.startTime.toISOString(),
						endTime: timeEntry.endTime.toISOString(),
					},
				});
			} catch (error) {
				logToolError("time_update", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to update time entry");
			}
		}
	);

	server.registerTool(
		"ai_autofill_time_entries",
		{
			description: "Create and start an AI autofill job for time entries on a specific local date.",
			inputSchema: z.object({
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			projectIds: z.array(z.number().int().positive()).optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:jobs");

				const activeJob = await prisma.aiJob.findFirst({
					where: {
						type: "autofill_time_entries",
						status: { in: ["pending", "processing"] },
						parameters: {
							path: ["date"],
							equals: args.date,
						},
					},
					orderBy: { createdAt: "desc" },
				});

				if (activeJob) {
					return createTextResult(`An autofill job is already active for ${args.date}.`, {
						job: activeJob,
						existing: true,
					});
				}

				const job = await prisma.aiJob.create({
					data: {
						type: "autofill_time_entries",
						status: "pending",
						progress: 0,
						parameters: {
							date: args.date,
							...(args.projectIds ? { projectIds: args.projectIds } : {}),
						},
					},
				});

				void (async () => {
					try {
						const { generateAutofillSuggestions } = await import("@/lib/ai-actions");
						const { Temporal } = await import("@/lib/temporal-polyfill");

						await prisma.aiJob.update({
							where: { id: job.id },
							data: {
								status: "processing",
								startedAt: new Date(),
								progress: 10,
							},
						});

						await prisma.aiJob.update({
							where: { id: job.id },
							data: { progress: 50 },
						});

						const result = await generateAutofillSuggestions({
							date: args.date,
							projectIds: args.projectIds,
							debugJobId: job.id,
						});

						if (result.suggestions.length === 0) {
							await prisma.aiJob.update({
								where: { id: job.id },
								data: {
									status: "completed",
									progress: 100,
									result: {
										entriesCreated: 0,
										message: result.activityCount === 0
											? "No activities found for this date"
											: "No matching work activities found",
									},
									completedAt: new Date(),
								},
							});
							return;
						}

						await prisma.aiJob.update({
							where: { id: job.id },
							data: { progress: 80 },
						});

						let entriesCreated = 0;
						for (const suggestion of result.suggestions) {
							try {
								const startInstant = Temporal.Instant.from(suggestion.startTime);
								const endInstant = Temporal.Instant.from(suggestion.endTime);
								const durationMinutes = Math.round(
									Number((endInstant.epochNanoseconds - startInstant.epochNanoseconds) / 60_000_000_000n)
								);

								await prisma.timeEntry.create({
									data: {
										projectId: suggestion.projectId,
										description: suggestion.description || null,
										startTime: new Date(suggestion.startTime),
										endTime: new Date(suggestion.endTime),
										durationMinutes,
										billable: suggestion.billable,
									},
								});
								entriesCreated++;
							} catch (error) {
								console.error("[MCP] Error creating autofill time entry:", error);
							}
						}

						await prisma.aiJob.update({
							where: { id: job.id },
							data: {
								status: "completed",
								progress: 100,
								result: {
									entriesCreated,
									totalSuggestions: result.suggestions.length,
									activityCount: result.activityCount,
									date: args.date,
								},
								completedAt: new Date(),
							},
						});
					} catch (error) {
						console.error(`[MCP] Autofill job ${job.id} failed:`, error);
						await prisma.aiJob.update({
							where: { id: job.id },
							data: {
								status: "failed",
								error: error instanceof Error ? error.message : String(error),
								completedAt: new Date(),
							},
						});
					}
				})();

				return createTextResult(`Queued autofill job ${job.id} for ${args.date}.`, {
					job: {
						id: job.id,
						type: job.type,
						status: job.status,
						progress: job.progress,
						parameters: job.parameters,
						createdAt: job.createdAt,
					},
				});
			} catch (error) {
				logToolError("ai_autofill_time_entries", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to queue autofill job");
			}
		}
	);

	server.registerTool(
		"ai_generate_weekly_summary",
		{
			description: "Generate a client-friendly weekly summary for a project based on its time entries in a date range.",
			inputSchema: z.object({
			projectId: z.number().int().positive(),
			weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:time");

				const project = await prisma.project.findUnique({
					where: { id: args.projectId },
					select: {
						id: true,
						name: true,
						client: { select: { id: true, name: true, email: true } },
					},
				});

				if (!project) {
					return createErrorResult(`Project ${args.projectId} not found.`, { projectId: args.projectId });
				}

				const weekStartAt = new Date(`${args.weekStart}T00:00:00.000Z`);
				const weekEndAt = new Date(`${args.weekEnd}T23:59:59.999Z`);

				if (Number.isNaN(weekStartAt.getTime()) || Number.isNaN(weekEndAt.getTime())) {
					return createErrorResult("Invalid weekStart or weekEnd. Expected YYYY-MM-DD.");
				}

				if (weekStartAt > weekEndAt) {
					return createErrorResult("weekStart must be on or before weekEnd.");
				}

				const timeEntries = await prisma.timeEntry.findMany({
					where: {
						projectId: args.projectId,
						startTime: {
							gte: weekStartAt,
							lte: weekEndAt,
						},
					},
					orderBy: { startTime: "asc" },
					select: {
						startTime: true,
						description: true,
						durationMinutes: true,
						billable: true,
					},
				});

				if (timeEntries.length === 0) {
					return createErrorResult(`No time entries found for project ${args.projectId} between ${args.weekStart} and ${args.weekEnd}.`, {
						projectId: args.projectId,
						weekStart: args.weekStart,
						weekEnd: args.weekEnd,
					});
				}

				const entries = timeEntries.map((entry) => ({
					date: entry.startTime.toISOString().split("T")[0]!,
					description: entry.description,
					hours: Math.round((entry.durationMinutes / 60) * 100) / 100,
				}));

				const summary = await generateWeeklySummary({
					projectId: args.projectId,
					weekStart: args.weekStart,
					weekEnd: args.weekEnd,
					entries,
				});

				const totalHours = Math.round((timeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0) / 60) * 100) / 100;

				return createTextResult(summary, {
					summary,
					project,
					weekStart: args.weekStart,
					weekEnd: args.weekEnd,
					entryCount: timeEntries.length,
					totalHours,
				});
			} catch (error) {
				logToolError("ai_generate_weekly_summary", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to generate weekly summary");
			}
		}
	);

	server.registerTool(
		"activity_list_for_date",
		{
			description: "List activity sessions for a local date in YYYY-MM-DD format.",
			inputSchema: z.object({
			date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:activity");
				const [year, month, day] = args.date.split("-").map(Number);
				const queryDate = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
				const startOfDay = new Date(queryDate);
				startOfDay.setUTCHours(startOfDay.getUTCHours() - 24);
				const endOfDay = new Date(queryDate);
				endOfDay.setUTCHours(endOfDay.getUTCHours() + 48);

				const allSessions = await prisma.activitySession.findMany({
					where: {
						startTime: {
							gte: startOfDay,
							lte: endOfDay,
						},
					},
					orderBy: { startTime: "asc" },
				});

				const sessions = allSessions.filter((session) => {
					const localStart = new Date(session.startTime);
					return (
						localStart.getFullYear() === year &&
						localStart.getMonth() + 1 === month &&
						localStart.getDate() === day
					);
				});

				return createTextResult(`Found ${sessions.length} activity sessions for ${args.date}.`, {
					sessions,
					count: sessions.length,
					date: args.date,
				});
			} catch (error) {
				logToolError("activity.list_for_date", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to list activity sessions");
			}
		}
	);

	server.registerTool(
		"settings_get",
		{
			description: "Get all settings or a single setting by key.",
			inputSchema: z.object({
			key: z.string().optional(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "read:settings");
				if (args.key) {
					const setting = await prisma.setting.findUnique({ where: { key: args.key } });
					if (!setting) {
						return createErrorResult(`Setting ${args.key} not found.`, { key: args.key });
					}

					return createTextResult(`Fetched setting ${setting.key}.`, {
						key: setting.key,
						value: setting.value,
					});
				}

				const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
				const settingsMap = settings.reduce<Record<string, string>>((acc, setting) => {
					acc[setting.key] = setting.value;
					return acc;
				}, {});

				return createTextResult(`Fetched ${settings.length} settings.`, {
					settings: settingsMap,
					count: settings.length,
				});
			} catch (error) {
				logToolError("settings_get", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to read settings");
			}
		}
	);

	server.registerTool(
		"settings_put",
		{
			description: "Update or create a setting by key.",
			inputSchema: z.object({
			key: z.string().regex(/^[a-zA-Z0-9._-]+$/),
			value: z.string(),
			}),
		},
		async (args, extra) => {
			const context = getContext(extra);
			try {
				requireMcpPermission(context, "write:settings");
				const setting = await prisma.setting.upsert({
					where: { key: args.key },
					update: { value: args.value },
					create: { key: args.key, value: args.value },
				});

				return createTextResult(`Saved setting ${setting.key}.`, {
					key: setting.key,
					value: setting.value,
				});
			} catch (error) {
				logToolError("settings_put", error, context.requestId);
				return createErrorResult(error instanceof Error ? error.message : "Failed to save setting");
			}
		}
	);
}