"use server";

import { tool, generateObject } from "ai";
import { z } from "zod";
import { Temporal } from "@/lib/temporal-polyfill";
import { getAiModel } from "@/lib/ai-provider";
import { withAiCache } from "@/lib/ai-actions/ai-cache";
import {
  getMailboxes as getMailboxesFromProvider,
  searchEmailsByKeyword,
  searchEmailsByDateRange,
  searchSentEmails,
  getFullEmailById,
  getSentEmailById,
  getEmailThreadById,
  type MailboxInfo,
} from "@/lib/jmap-provider";

/**
 * Server action to fetch available JMAP mailboxes
 * This wraps the JMAP provider function for use in client components
 */
export async function fetchMailboxes(): Promise<MailboxInfo[]> {
  try {
    const mailboxes = await getMailboxesFromProvider();
    return mailboxes;
  } catch (error) {
    console.error("Error fetching mailboxes:", error);
    return [];
  }
}

/**
 * Strip quoted/forwarded content from an email body so the AI only
 * sees the new text the user actually wrote.
 *
 * Removes:
 * - Lines starting with > (quoted reply blocks)
 * - Common forwarded-message headers ("---------- Forwarded message ---------")
 * - Trailing "On <date>, <name> wrote:" attribution lines
 */
function stripQuotedContent(body: string): string {
  const lines = body.split("\n");
  const stripped: string[] = [];
  let inForwardedBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect forwarded message delimiter
    if (/^-{3,}\s*(forwarded|original)\s+message\s*-{3,}/i.test(trimmed)) {
      inForwardedBlock = true;
      break;
    }

    // Skip quoted lines ("> text")
    if (trimmed.startsWith(">")) continue;

    // Skip "On <date>, <name> wrote:" attribution (often spans 1-2 lines)
    if (/^on .{5,}, .+ wrote:$/i.test(trimmed)) continue;

    if (!inForwardedBlock) {
      stripped.push(line);
    }
  }

  return stripped.join("\n").trim();
}

/**
 * Use the AI to estimate how long the user spent composing the new
 * portion of a sent email (excluding any quoted/forwarded content).
 */
async function estimateEmailCompositionMinutes(
  subject: string,
  newBodyText: string,
  originalBodyLength: number,
): Promise<{ minutes: number; reasoning: string }> {
  return withAiCache(
    "email.estimateCompositionMinutes",
    { subject, newBodyText, originalBodyLength },
    async () => {
      const model = await getAiModel();

      const { object } = await generateObject({
        model,
        schema: z.object({
          estimatedMinutes: z
            .number()
            .int()
            .describe("Estimated minutes spent composing this email (5–120)"),
          reasoning: z
            .string()
            .describe("One sentence explaining the estimate"),
        }),
        prompt: `You are estimating how long a freelancer spent composing a sent email.

Subject: ${subject}
New text written (quoted/forwarded content already stripped):
---
${newBodyText.substring(0, 2000)}
---
Original full body length: ${originalBodyLength} chars
Stripped body length: ${newBodyText.length} chars

Consider:
- Only the NEW text the person wrote (already stripped of quotes/forwards)
- Time to read the incoming message before replying
- Complexity and thoughtfulness of the response
- Short acknowledgements are 5–10 min; detailed technical responses 30–60 min
- A forwarded message with a brief note is 5–10 min

Return a realistic estimate between 5 and 120 minutes.`,
      });

      return { minutes: object.estimatedMinutes, reasoning: object.reasoning };
    }
  );
}

// ──────────────────────────────────────────────────
// Reusable AI tool factories
// ──────────────────────────────────────────────────

/**
 * Create email search tools scoped to a specific date range.
 * Used by AI agents in generateWeeklySummary, generateAutofillSuggestions, etc.
 */
export async function createEmailSearchTools(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
) {
  return {
    searchEmailsByKeyword: tool({
      description:
        "Search for emails containing specific keywords within the time period. Use this to find project communications that provide context.",
      inputSchema: z.object({
        keyword: z
          .string()
          .describe(
            "Search keyword (project name, feature, client name). One or two words preferred."
          ),
        limit: z.number().optional().default(5).describe("Max results"),
      }),
      execute: async ({ keyword, limit }: { keyword: string; limit?: number }) => {
        const results = await searchEmailsByKeyword(
          keyword,
          startInstant,
          endInstant,
          limit || 5
        );
        if (results.length === 0) {
          return { count: 0, message: `No emails found for "${keyword}"` };
        }
        console.log(`searchEmailsByKeyword results for "${keyword}":`, results);
        return {
          count: results.length,
          emails: results.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            date: e.date.toISOString().split("T")[0],
            from: e.from,
            subject: e.subject,
            preview: e.preview.substring(0, 150),
          })),
        };
      },
    }),

    searchEmailsFromClient: tool({
      description:
        "Search for emails from specific email addresses within the time period. Use this to find direct communications from a client.",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(5)
          .describe("Max results"),
        emails: z
          .array(z.string())
          .describe("Email addresses to search from"),
      }),
      execute: async ({ limit, emails }: { limit?: number; emails: string[] }) => {
        const results = await searchEmailsByDateRange(
          startInstant,
          endInstant,
          limit || 5,
          emails
        );
        if (results.length === 0) {
          return {
            count: 0,
            message: `No emails found from addresses: ${emails.join(", ")}`,
          };
        }
        console.log("searchEmailsFromClient results:", results);
        return {
          count: results.length,
          emails: results.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            date: e.date.toISOString().split("T")[0],
            from: e.from,
            subject: e.subject,
            preview: e.preview.substring(0, 150),
          })),
        };
      },
    }),

    getFullEmailThread: tool({
      description:
        "Retrieve the full email thread for a specific thread by its ID. Use this to get complete context from important email conversations.",
      inputSchema: z.object({
        threadId: z
          .string()
          .describe("The thread ID of the email thread to retrieve"),
      }),
      execute: async ({ threadId }: { threadId: string }) => {
        const emails = await getEmailThreadById(threadId);
        if (!emails) {
          return { message: `Email thread with ID ${threadId} not found` };
        }
        console.log("Fetched all emails in thread ID:", threadId);
        return {
          emails: emails.map((e) => ({
            id: e.id,
            date: e.date.toISOString().split("T")[0],
            from: e.from,
            to: e.to,
            subject: e.subject,
            body: e.body,
          })),
        };
      },
    }),

    getFullEmailContent: tool({
      description:
        "Retrieve the full content of a specific email by its ID. Use this to get detailed context from important emails.",
      inputSchema: z.object({
        emailId: z
          .string()
          .describe("The unique identifier of the email to retrieve"),
      }),
      execute: async ({ emailId }: { emailId: string }) => {
        const email = await getFullEmailById(emailId);
        if (!email) {
          return { message: `Email with ID ${emailId} not found` };
        }
        console.log("Fetched full email content for ID:", emailId);
        return {
          id: email.id,
          date: email.date.toISOString().split("T")[0],
          from: email.from,
          to: email.to,
          subject: email.subject,
          body: email.body,
        };
      },
    }),
  };
}

/**
 * Create tools for searching the user's sent emails and estimating composition time.
 * Used by the autofill agent to infer client work from outgoing emails.
 */
export async function createSentEmailTools(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
) {
  return {
    searchSentEmails: tool({
      description:
        "Search the user's Sent folder for emails sent within the time period. " +
        "Optionally filter by recipient email addresses. " +
        "Use this to discover what clients or projects the user was corresponding with.",
      inputSchema: z.object({
        toEmails: z
          .array(z.string())
          .optional()
          .describe(
            "Optional recipient email addresses to filter by (e.g. client emails)"
          ),
        limit: z.number().optional().default(10).describe("Max results"),
      }),
      execute: async ({
        toEmails,
        limit,
      }: {
        toEmails?: string[];
        limit?: number;
      }) => {
        const results = await searchSentEmails(
          startInstant,
          endInstant,
          limit || 10,
          toEmails
        );
        if (results.length === 0) {
          return {
            count: 0,
            message: toEmails
              ? `No sent emails found to: ${toEmails.join(", ")}`
              : "No sent emails found in the time period",
          };
        }
        console.log(
          `searchSentEmails results (${results.length}):`,
          results.map((e) => e.subject)
        );
        return {
          count: results.length,
          emails: results.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            date: e.date.toISOString(),
            to: e.to,
            subject: e.subject,
            preview: e.preview.substring(0, 200),
            sizeBytes: e.sizeBytes,
          })),
        };
      },
    }),

    estimateEmailTime: tool({
      description:
        "Fetch a sent email's full content and estimate how long the user spent composing it. " +
        "Returns the email details plus an estimated composition time in minutes. " +
        "A short reply is ~15 min, a medium response ~30 min, a detailed email ~45-60 min.",
      inputSchema: z.object({
        emailId: z
          .string()
          .describe("The ID of the sent email to analyze"),
      }),
      execute: async ({ emailId }: { emailId: string }) => {
        const email = await getSentEmailById(emailId);
        if (!email) {
          return { message: `Email with ID ${emailId} not found` };
        }

        const fullBody = email.body || "";
        const newBody = stripQuotedContent(fullBody);
        const { minutes: estimatedMinutes, reasoning } = await estimateEmailCompositionMinutes(
          email.subject,
          newBody,
          fullBody.length,
        );

        console.log(
          `estimateEmailTime for "${email.subject}": ${fullBody.length} chars total, ` +
          `${newBody.length} chars new text → ${estimatedMinutes} min (${reasoning})`
        );

        return {
          id: email.id,
          date: email.date.toISOString(),
          from: email.from,
          to: email.to,
          subject: email.subject,
          newBodyLengthChars: newBody.length,
          estimatedCompositionMinutes: estimatedMinutes,
          reasoning,
        };
      },
    }),
  };
}
