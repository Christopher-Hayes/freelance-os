/**
 * Custom NextAuth email provider using JMAP (Fastmail)
 * Works with Edge runtime unlike SMTP/Nodemailer
 * Fetches JMAP settings from database instead of environment variables
 */

import { prisma } from '@freelance-os/database';

interface JMAPSession {
  apiUrl: string;
  primaryAccounts: {
    "urn:ietf:params:jmap:mail": string;
  };
}

async function getSession(token: string, hostname: string): Promise<JMAPSession> {
  const authUrl = `https://${hostname}/.well-known/jmap`;
  
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

async function sendEmail(
  apiUrl: string,
  accountId: string,
  token: string,
  draftId: string,
  identityId: string,
  to: string,
  subject: string,
  text: string,
  html: string,
  from: string
): Promise<void> {
  const draftObject = {
    from: [{ email: from }],
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
  
  // Check for errors
  if (data.methodResponses[0][1].notCreated || data.methodResponses[1][1].notCreated) {
    const error = data.methodResponses[0][1].notCreated || data.methodResponses[1][1].notCreated;
    throw new Error(`JMAP error: ${JSON.stringify(error)}`);
  }
}

/**
 * Fetch JMAP settings from database
 */
async function getJMAPSettings() {
  // Try to get settings - there should only be one row with key 'main'
  const settings = await prisma.setting.findUnique({
    where: { key: 'main' }
  });
  
  if (!settings?.jmapToken || !settings?.jmapUsername) {
    throw new Error("JMAP settings not configured in database. Please configure JMAP in admin settings.");
  }
  
  return {
    token: settings.jmapToken,
    username: settings.jmapUsername,
    hostname: settings.jmapHostname || 'api.fastmail.com',
  };
}

export async function sendVerificationRequest(params: {
  identifier: string;
  url: string;
  provider: { from?: string };
}) {
  const { identifier: email, url, provider } = params;
  
  console.log("[JMAP] Sending verification email to:", email);
  console.log("[JMAP] Magic link URL:", url);
  
  // Fetch JMAP settings from database
  const { token, username, hostname } = await getJMAPSettings();

  try {
    const session = await getSession(token, hostname);
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
    const draftId = await getDraftMailboxId(session.apiUrl, accountId, token);
    const identityId = await getIdentityId(session.apiUrl, accountId, token, username);

    const subject = "Sign in to Client Portal";
    const text = `Sign in to the Client Portal\n\nClick the link below to sign in:\n\n${url}\n\nIf you did not request this email, you can safely ignore it.`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Sign in to Client Portal</h2>
      <p>Click the button below to sign in:</p>
      <a href="${url}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Sign in</a>
      <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
      <p style="color: #666; font-size: 14px; word-break: break-all;">${url}</p>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">If you did not request this email, you can safely ignore it.</p>
    </div>
  `;

    await sendEmail(
      session.apiUrl,
      accountId,
      token,
      draftId,
      identityId,
      email,
      subject,
      text,
      html,
      provider.from || username
    );
    
    console.log("[JMAP] Email sent successfully!");
  } catch (error) {
    console.error("[JMAP] Error sending email:", error);
    throw error;
  }
}
