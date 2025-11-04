/**
 * JMAP Email Client
 * Works with any JMAP-compatible email provider (Fastmail, etc.)
 * Compatible with Edge runtime (no Node.js dependencies)
 */

const hostname = process.env.JMAP_HOSTNAME || "api.fastmail.com";
const authUrl = `https://${hostname}/.well-known/jmap`;

interface JMAPSession {
  apiUrl: string;
  primaryAccounts: {
    "urn:ietf:params:jmap:mail": string;
  };
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}

async function getSession(token: string): Promise<JMAPSession> {
  const response = await fetch(authUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get JMAP session: ${response.statusText}`);
  }
  
  return response.json();
}

async function getDraftMailboxId(
  apiUrl: string,
  accountId: string,
  token: string
): Promise<string> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        ["Mailbox/query", { accountId, filter: { name: "Drafts" } }, "a"],
      ],
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get draft mailbox: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.methodResponses[0][1].ids[0];
}

async function getIdentityId(
  apiUrl: string,
  accountId: string,
  token: string,
  username: string
): Promise<string> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      methodCalls: [["Identity/get", { accountId, ids: null }, "a"]],
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get identity: ${response.statusText}`);
  }
  
  const data = await response.json();
  const identity = data.methodResponses[0][1].list.find(
    (id: { email: string }) => id.email === username
  );
  
  if (!identity) {
    throw new Error(`No identity found for email: ${username}`);
  }
  
  return identity.id;
}

/**
 * Send an email via JMAP
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const { to, subject, text, html, from } = options;
  
  const token = process.env.JMAP_TOKEN;
  const username = process.env.JMAP_USERNAME;

  if (!token || !username) {
    throw new Error("JMAP_TOKEN and JMAP_USERNAME environment variables must be set");
  }

  try {
    console.log(`[JMAP] Sending email to: ${to}, subject: "${subject}"`);
    
    const session = await getSession(token);
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
    const draftId = await getDraftMailboxId(session.apiUrl, accountId, token);
    const identityId = await getIdentityId(session.apiUrl, accountId, token, username);

    const draftObject = {
      from: [{ email: from || username }],
      to: [{ email: to }],
      subject,
      keywords: { $draft: true },
      mailboxIds: { [draftId]: true },
      bodyValues: {
        text: { value: text, charset: "utf-8" },
        html: { value: html, charset: "utf-8" },
      },
      textBody: [{ partId: "text", type: "text/plain" }],
      htmlBody: [{ partId: "html", type: "text/html" }],
    };

    const response = await fetch(session.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        using: [
          "urn:ietf:params:jmap:core",
          "urn:ietf:params:jmap:mail",
          "urn:ietf:params:jmap:submission",
        ],
        methodCalls: [
          ["Email/set", { accountId, create: { draft: draftObject } }, "a"],
          [
            "EmailSubmission/set",
            {
              accountId,
              onSuccessDestroyEmail: ["#sendIt"],
              create: { sendIt: { emailId: "#draft", identityId } },
            },
            "b",
          ],
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send email: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check for errors in method responses
    if (data.methodResponses[0][1].notCreated || data.methodResponses[1][1].notCreated) {
      const error = data.methodResponses[0][1].notCreated || data.methodResponses[1][1].notCreated;
      throw new Error(`JMAP error: ${JSON.stringify(error)}`);
    }
    
    console.log(`[JMAP] Email sent successfully to ${to}`);
  } catch (error) {
    console.error("[JMAP] Error sending email:", error);
    throw error;
  }
}
