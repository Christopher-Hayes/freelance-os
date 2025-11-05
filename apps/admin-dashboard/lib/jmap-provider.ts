"use server";

import JamClient from "jmap-jam";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";

/**
 * Get JMAP client configured from settings
 * Returns null if JMAP is not enabled or not configured
 */
async function getJmapClient(): Promise<JamClient | null> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });
  
  if (!settings?.jmapEnabled || !settings.jmapToken || !settings.jmapHostname) {
    return null;
  }

  // Construct session URL from hostname
  const sessionUrl = `https://${settings.jmapHostname}/.well-known/jmap`;
  
  const client = new JamClient({
    sessionUrl,
    bearerToken: settings.jmapToken,
  });

  return client;
}

export interface EmailSearchResult {
  id: string;
  subject: string;
  from: string;
  date: Date;
  preview: string;
  threadId: string;
}

export interface EmailResult {
  id: string;
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  date: Date;
  body: string;
  threadId: string;
}

/**
 * Search emails within a date range using JMAP
 * Returns empty array if JMAP is not configured or disabled
 */
export async function searchEmailsByDateRange(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
  limit: number = 50
): Promise<EmailSearchResult[]> {
  const client = await getJmapClient();
  
  if (!client) {
    console.log("JMAP not enabled or configured, skipping email search");
    return [];
  }

  try {
    const accountId = await client.getPrimaryAccount();
    
    // Search for emails in the date range
    // Note: Using requestMany instead of client.api because Fastmail requires
    // explicit urn:ietf:params:jmap:core capability
    const [{ emailIds, emails }] = await client.requestMany((t) => {
      const emailIds = t.Email.query({
        accountId,
        filter: {
          after: startInstant.toString(),
          before: endInstant.toString(),
        },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      });

      const emails = t.Email.get({
        accountId,
        ids: emailIds.$ref("/ids"),
        properties: ["id", "subject", "from", "receivedAt", "preview", "threadId"],
      });

      return { emailIds, emails };
    }, {
      // Explicitly include core capability (required by Fastmail)
      using: ["urn:ietf:params:jmap:core"],
    });

    // Transform JMAP email format to our interface
    const results: EmailSearchResult[] = emails.list.map((email) => ({
      id: email.id,
      subject: email.subject || "(No subject)",
      from: email.from?.[0]?.email || "unknown",
      date: new Date(email.receivedAt || new Date()),
      preview: email.preview || "",
      threadId: email.threadId || email.id,
    }));

    return results;
  } catch (error) {
    console.error("Error searching emails via JMAP:", error);
    return [];
  }
}

/**
 * Search emails by keyword within a date range
 */
export async function searchEmailsByKeyword(
  keyword: string,
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
  limit: number = 50
): Promise<EmailSearchResult[]> {
  const client = await getJmapClient();
  
  if (!client) {
    console.log("JMAP not enabled or configured, skipping email search");
    return [];
  }

  try {
    const accountId = await client.getPrimaryAccount();
    
    // Note: Using requestMany instead of client.api because Fastmail requires
    // explicit urn:ietf:params:jmap:core capability
    const [{ emailIds, emails }] = await client.requestMany((t) => {
      const emailIds = t.Email.query({
        accountId,
        filter: {
          text: keyword,
          after: startInstant.toString(),
          before: endInstant.toString(),
        },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      });

      const emails = t.Email.get({
        accountId,
        ids: emailIds.$ref("/ids"),
        properties: ["id", "subject", "from", "receivedAt", "preview", "threadId"],
      });

      return { emailIds, emails };
    }, {
      // Explicitly include core capability (required by Fastmail)
      using: ["urn:ietf:params:jmap:core"],
    });

    const results: EmailSearchResult[] = emails.list.map((email) => ({
      id: email.id,
      subject: email.subject || "(No subject)",
      from: email.from?.[0]?.email || "unknown",
      date: new Date(email.receivedAt || new Date()),
      preview: email.preview || "",
      threadId: email.threadId || email.id,
    }));

    return results;
  } catch (error) {
    console.error("Error searching emails via JMAP:", error);
    return [];
  }
}

export async function getEmailThreadById(emailId: string): Promise<EmailResult[] | null> {
  const client = await getJmapClient();
  
  if (!client) {
    console.log("JMAP not enabled or configured, skipping getEmailThreadById");
    return null;
  }

  try {
    const accountId = await client.getPrimaryAccount();

    const [thread] = await client.api.Thread.get({
      ids: [emailId],
      accountId,
      properties: [
        "id",
        "emailIds",
      ],
    });

    const emailIds = thread.list.flatMap((e) => e)[0]?.emailIds
    if (!emailIds) {
      return null;
    }

    // Now get all emails in the thread
    const [emails] = await client.api.Email.get({
      ids: emailIds,
      accountId,
      properties: [
        "id",
        "subject",
        "from",
        "to",
        "cc",
        "bcc",
        "receivedAt",
        "bodyValues",
        "threadId",
      ],
    })

    const results: EmailResult[] = emails.list.flatMap((e) => e).map((properties) => {
      const bodyValueId = properties.bodyValues ? properties.bodyValues["body"] : null;
      const body = bodyValueId ? bodyValueId.value : "";

      return {
        id: properties.id,
        subject: properties.subject || "(No subject)",
        from: properties.from?.[0]?.email || "unknown",
        to: properties.to?.map((addr) => addr.email) || [],
        cc: properties.cc?.map((addr) => addr.email) || [],
        bcc: properties.bcc?.map((addr) => addr.email) || [],
        date: new Date(properties.receivedAt || new Date()),
        body,
        threadId: properties.threadId || properties.id,
      };
    });

    return results;
  } catch (error) {
    console.error("Error fetching email thread via JMAP:", error);
    return null;
  }
}

export async function getFullEmailById(emailId: string): Promise<EmailResult | null> {
  const client = await getJmapClient();
  
  if (!client) {
    console.log("JMAP not enabled or configured, skipping getFullEmailById");
    return null;
  }

  try {
    const accountId = await client.getPrimaryAccount();
    
    const [email] = await client.api.Email.get({
      ids: [emailId],
      accountId,
      properties: [
        "id",
        "subject",
        "from",
        "to",
        "cc",
        "bcc",
        "receivedAt",
        "bodyValues",
        "threadId",
      ],
    })

    const properties = email.list.flatMap((e) => e)[0];

    if (!properties) {
      return null;
    }

    const { id, subject, bodyValues, from, to, cc, bcc, receivedAt, threadId } = properties;
    const bodyValueId = bodyValues ? bodyValues["body"] : null;
    const body = bodyValueId ? bodyValueId.value : "";

    const result: EmailResult = {
      id,
      subject: subject || "(No subject)",
      from: from?.[0]?.email || "unknown",
      to: to?.map((addr) => addr.email) || [],
      cc: cc?.map((addr) => addr.email) || [],
      bcc: bcc?.map((addr) => addr.email) || [],
      date: new Date(receivedAt || new Date()),
      body,
      threadId: threadId || id,
    };

    return result;
  } catch (error) {
    console.error("Error fetching full email via JMAP:", error);
    return null;
  }
}

/**
 * Check if JMAP is enabled and configured
 */
export async function isJmapEnabled(): Promise<boolean> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });
  
  return !!(settings?.jmapEnabled && settings.jmapToken && settings.jmapHostname);
}
