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
  
  console.log("JMAP Settings Check:", {
    canReadMailbox: settings?.canReadMailbox,
    hasToken: !!settings?.jmapToken,
    hasHostname: !!settings?.jmapHostname,
  });
  
  if (!settings?.canReadMailbox || !settings.jmapToken || !settings.jmapHostname) {
    console.log("JMAP not fully configured - returning null client");
    return null;
  }

  // Construct session URL from hostname
  const sessionUrl = `https://${settings.jmapHostname}/.well-known/jmap`;
  
  console.log("Creating JMAP client with sessionUrl:", sessionUrl);
  
  const client = new JamClient({
    sessionUrl,
    bearerToken: settings.jmapToken,
  });

  return client;
}

/**
 * Get allowed mailbox IDs from settings
 * Returns null if all mailboxes are allowed (default behavior)
 */
async function getAllowedMailboxes(): Promise<string[] | null> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });
  
  // If no mailboxes specified, allow all (return null means no filter)
  if (!settings?.jmapAllowedMailboxes || settings.jmapAllowedMailboxes.length === 0) {
    return null;
  }
  
  return settings.jmapAllowedMailboxes;
}

export interface EmailSearchResult {
  id: string;
  subject: string;
  from: string;
  to?: string[];
  date: Date;
  preview: string;
  threadId: string;
  sizeBytes?: number;
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

export interface MailboxInfo {
  id: string;
  name: string;
  role: string | null;
  totalEmails: number;
}

/**
 * Search emails within a date range using JMAP
 * Returns empty array if JMAP is not configured or disabled
 */
export async function searchEmailsByDateRange(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
  limit: number = 50,
  fromEmails?: string[]
): Promise<EmailSearchResult[]> {
  const client = await getJmapClient();
  
  if (!client) {
    console.log("JMAP not enabled or configured, skipping email search");
    return [];
  }

  try {
    const accountId = await client.getPrimaryAccount();
    const allowedMailboxes = await getAllowedMailboxes();
    
    console.log("JMAP Search - accountId:", accountId);
    console.log("JMAP Search - allowedMailboxes:", allowedMailboxes);
    console.log("JMAP Search - date range:", {
      after: startInstant.toString(),
      before: endInstant.toString(),
    });
    console.log("JMAP Search - fromEmails:", fromEmails);
    
    // Build the base filter with date range
    const baseFilter: any = {
      after: startInstant.toString(),
      before: endInstant.toString(),
    };

    // Add optional from address filtering
    if (fromEmails && fromEmails.length > 0) {
      // JMAP 'from' field supports text search
      baseFilter.from = fromEmails.join(" OR ");
    }

    // Build the final filter with mailbox restrictions using JMAP FilterOperator
    let filter: any;
    if (!allowedMailboxes || allowedMailboxes.length === 0) {
      // No mailbox filtering
      filter = baseFilter;
    } else if (allowedMailboxes.length === 1) {
      // Single mailbox - use inMailbox property directly
      filter = {
        ...baseFilter,
        inMailbox: allowedMailboxes[0],
      };
    } else {
      // Multiple mailboxes - use FilterOperator with OR conditions
      // Each condition combines the base filter with a specific mailbox
      filter = {
        operator: "OR",
        conditions: allowedMailboxes.map((mailboxId) => ({
          ...baseFilter,
          inMailbox: mailboxId,
        })),
      };
    }
    
    console.log("JMAP Search - final filter:", JSON.stringify(filter, null, 2));

    // Search for emails with the constructed filter
    // Note: Using requestMany instead of client.api because Fastmail requires
    // explicit urn:ietf:params:jmap:core capability
    const [{ emailIds, emails }] = await client.requestMany((t) => {
      const emailIds = t.Email.query({
        accountId,
        filter,
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

    console.log(`JMAP Search - found ${results.length} emails`);

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
    const allowedMailboxes = await getAllowedMailboxes();
    
    // Build the base filter with keyword and date range
    const baseFilter: any = {
      text: keyword,
      after: startInstant.toString(),
      before: endInstant.toString(),
    };

    // Build the final filter with mailbox restrictions using JMAP FilterOperator
    let filter: any;
    if (!allowedMailboxes || allowedMailboxes.length === 0) {
      // No mailbox filtering
      filter = baseFilter;
    } else if (allowedMailboxes.length === 1) {
      // Single mailbox - use inMailbox property directly
      filter = {
        ...baseFilter,
        inMailbox: allowedMailboxes[0],
      };
    } else {
      // Multiple mailboxes - use FilterOperator with OR conditions
      filter = {
        operator: "OR",
        conditions: allowedMailboxes.map((mailboxId) => ({
          ...baseFilter,
          inMailbox: mailboxId,
        })),
      };
    }
    
    // Note: Using requestMany instead of client.api because Fastmail requires
    // explicit urn:ietf:params:jmap:core capability
    const [{ emailIds, emails }] = await client.requestMany((t) => {
      const emailIds = t.Email.query({
        accountId,
        filter,
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
    
    // @ts-ignore TS bug
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
      fetchAllBodyValues: true,
    })

    const properties = email.list.flatMap((e) => e)[0];

    if (!properties) {
      return null;
    }

    const { id, subject, bodyValues, from, to, cc, bcc, receivedAt, threadId } = properties;
    // JMAP part IDs are numeric strings ("1", "2", etc.) - take the first text part value
    const bodyValue = bodyValues ? Object.values(bodyValues)[0] : null;
    const body = typeof (bodyValue as any)?.value === "string" ? (bodyValue as any).value : "";

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
 * Retrieve a single email by ID, but only if it exists in the Sent mailbox.
 * This is useful for IDs returned by searchSentEmails, which are discovered via
 * a Sent-scoped query and may not always resolve through a generic Email/get.
 */
export async function getSentEmailById(emailId: string): Promise<EmailResult | null> {
  const client = await getJmapClient();

  if (!client) {
    console.log("JMAP not enabled or configured, skipping getSentEmailById");
    return null;
  }

  try {
    const accountId = await client.getPrimaryAccount();

    const [mailboxes] = await client.api.Mailbox.get({
      accountId,
      properties: ["id", "name", "role"],
    }, // @ts-ignore TS bug
    {
      using: ["urn:ietf:params:jmap:core"],
    });

    const sentMailbox = mailboxes.list
      .flatMap((e) => e)
      .find((m) => m.role === "sent");

    if (!sentMailbox) {
      console.log("No Sent mailbox found while fetching sent email by ID");
      return null;
    }

    // @ts-ignore TS bug - fetchAllBodyValues not in jmap-jam typings, required by JMAP RFC 8621
    const [email] = await (client.api.Email.get as any)({
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
        "mailboxIds",
      ],
      // Without this flag, JMAP returns bodyValues as an empty map {}
      fetchAllBodyValues: true,
    }, {
      using: ["urn:ietf:params:jmap:core"],
    });

    const properties: any = email.list.flatMap((e: any) => e)[0];

    if (!properties) {
      return null;
    }

    const mailboxIds = properties.mailboxIds ? Object.keys(properties.mailboxIds) : [];
    if (!mailboxIds.includes(sentMailbox.id)) {
      return null;
    }

    const { id, subject, bodyValues, from, to, cc, bcc, receivedAt, threadId } = properties;
    const bodyValue: any = bodyValues ? Object.values(bodyValues)[0] : null;
    const body = typeof bodyValue?.value === "string" ? bodyValue.value : "";

    return {
      id,
      subject: subject || "(No subject)",
      from: from?.[0]?.email || "unknown",
      to: to?.map((addr: any) => addr.email) || [],
      cc: cc?.map((addr: any) => addr.email) || [],
      bcc: bcc?.map((addr: any) => addr.email) || [],
      date: new Date(receivedAt || new Date()),
      body,
      threadId: threadId || id,
    };
  } catch (error) {
    console.error("Error fetching sent email via JMAP:", error);
    return null;
  }
}

/**
 * Search the user's Sent mailbox for emails within a date range
 * Optionally filter by recipient email addresses (to find emails sent to specific clients)
 * Returns empty array if JMAP is not configured, disabled, or no Sent mailbox found
 */
export async function searchSentEmails(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
  limit: number = 50,
  toEmails?: string[]
): Promise<EmailSearchResult[]> {
  const client = await getJmapClient();

  if (!client) {
    console.log("JMAP not enabled or configured, skipping sent email search");
    return [];
  }

  try {
    const accountId = await client.getPrimaryAccount();

    // Find the Sent mailbox by role
    const [mailboxes] = await client.api.Mailbox.get({
      accountId,
      properties: ["id", "name", "role"],
    }, // @ts-ignore TS bug
    {
      using: ["urn:ietf:params:jmap:core"],
    });

    const sentMailbox = mailboxes.list
      .flatMap((e) => e)
      .find((m) => m.role === "sent");

    if (!sentMailbox) {
      console.log("No Sent mailbox found");
      return [];
    }

    console.log("JMAP Sent Search - sentMailboxId:", sentMailbox.id);

    // Build filter scoped to the Sent mailbox
    const filter: any = {
      inMailbox: sentMailbox.id,
      after: startInstant.toString(),
      before: endInstant.toString(),
    };

    // Add optional recipient filtering
    if (toEmails && toEmails.length > 0) {
      filter.to = toEmails.join(" OR ");
    }

    const [{ emailIds, emails }] = await client.requestMany((t) => {
      const emailIds = t.Email.query({
        accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      });

      const emails = t.Email.get({
        accountId,
        ids: emailIds.$ref("/ids"),
        properties: ["id", "subject", "from", "to", "receivedAt", "preview", "threadId", "size"],
      });

      return { emailIds, emails };
    }, {
      using: ["urn:ietf:params:jmap:core"],
    });

    const results: EmailSearchResult[] = emails.list.map((email) => ({
      id: email.id,
      subject: email.subject || "(No subject)",
      from: email.from?.[0]?.email || "unknown",
      to: email.to?.map((addr: any) => addr.email) || [],
      date: new Date(email.receivedAt || new Date()),
      preview: email.preview || "",
      threadId: email.threadId || email.id,
      sizeBytes: email.size || 0,
    }));

    console.log(`JMAP Sent Search - found ${results.length} sent emails`);

    return results;
  } catch (error) {
    console.error("Error searching sent emails via JMAP:", error);
    return [];
  }
}

/**
 * Check if JMAP is enabled and configured
 */
export async function isJmapEnabled(): Promise<boolean> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });
  
  return !!(settings?.canReadMailbox && settings.jmapToken && settings.jmapHostname);
}

/**
 * Get all available mailboxes from JMAP server
 * Returns empty array if JMAP is not configured or disabled
 */
export async function getMailboxes(): Promise<MailboxInfo[]> {
  const client = await getJmapClient();
  
  if (!client) {
    console.log("JMAP not enabled or configured, skipping getMailboxes");
    return [];
  }

  try {
    const accountId = await client.getPrimaryAccount();
    
    const [mailboxes] = await client.api.Mailbox.get({
      accountId,
      properties: ["id", "name", "role", "totalEmails"],
    }, // @ts-ignore TS bug
    {
      using: ["urn:ietf:params:jmap:core"],
    });

    const results: MailboxInfo[] = mailboxes.list.flatMap((e) => e).map((mailbox) => ({
      id: mailbox.id,
      name: mailbox.name || "(Unknown)",
      role: mailbox.role || null,
      totalEmails: mailbox.totalEmails || 0,
    }));

    return results;
  } catch (error) {
    console.error("Error fetching mailboxes via JMAP:", error);
    return [];
  }
}
