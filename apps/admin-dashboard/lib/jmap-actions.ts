"use server";

import { tool } from "ai";
import { z } from "zod";
import { Temporal } from "@/lib/temporal-polyfill";
import {
  getMailboxes as getMailboxesFromProvider,
  searchEmailsByKeyword,
  searchEmailsByDateRange,
  searchSentEmails,
  getFullEmailById,
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
 * Estimate how long it took to compose an email based on its content length.
 * Returns estimated minutes spent reading and writing the email.
 *
 * Heuristic:
 * - Very short reply (< 500 chars): ~15 minutes (reading + quick response)
 * - Short reply (500-1500 chars): ~20 minutes
 * - Medium email (1500-4000 chars): ~30 minutes
 * - Detailed email (4000-8000 chars): ~45 minutes
 * - Long/complex email (> 8000 chars): ~60 minutes
 */
export async function estimateEmailCompositionMinutes(bodyLength: number): Promise<number> {
  if (bodyLength < 500) return Promise.resolve(15);
  if (bodyLength < 1500) return Promise.resolve(20);
  if (bodyLength < 4000) return Promise.resolve(30);
  if (bodyLength < 8000) return Promise.resolve(45);
  return Promise.resolve(60);
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
        const email = await getFullEmailById(emailId);
        if (!email) {
          return { message: `Email with ID ${emailId} not found` };
        }
        const bodyLength = email.body?.length || 0;
        const estimatedMinutes = estimateEmailCompositionMinutes(bodyLength);

        console.log(
          `estimateEmailTime for "${email.subject}": ${bodyLength} chars → ${estimatedMinutes} min`
        );

        return {
          id: email.id,
          date: email.date.toISOString(),
          from: email.from,
          to: email.to,
          subject: email.subject,
          bodyLengthChars: bodyLength,
          estimatedCompositionMinutes: estimatedMinutes,
          preview: email.body?.substring(0, 300) || "",
        };
      },
    }),
  };
}
