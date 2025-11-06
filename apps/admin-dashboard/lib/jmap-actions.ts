"use server";

import { getMailboxes as getMailboxesFromProvider, type MailboxInfo } from "@/lib/jmap-provider";

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
