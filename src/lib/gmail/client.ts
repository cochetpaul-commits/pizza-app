/**
 * Gmail API client — OAuth2 with refresh token
 *
 * Uses googleapis-common pattern without the full SDK:
 * direct fetch to Gmail REST API with auto-refreshed access token.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

let cachedToken: { access_token: string; expires_at: number } | null = null;

// ── OAuth2 token refresh ─────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
    return cachedToken.access_token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return cachedToken.access_token;
}

async function gmailFetch(path: string): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  headers?: { name: string; value: string }[];
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: GmailMessagePart;
  internalDate: string;
};

// ── Public API ───────────────────────────────────────────────────────────────

/** Fetch a single Gmail message by ID (full format) */
export async function getGmailMessage(messageId: string): Promise<GmailMessage> {
  const res = await gmailFetch(`/messages/${messageId}?format=full`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail getMessage failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Download an attachment as Buffer */
export async function getAttachmentBuffer(
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await gmailFetch(`/messages/${messageId}/attachments/${attachmentId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail getAttachment failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  // Gmail returns base64url-encoded data
  const base64 = (data.data as string).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

/** Get header value from a message part */
export function getHeader(part: GmailMessagePart, name: string): string | null {
  const h = part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

/** Find all PDF attachments in a message (recursive) */
export function findPdfAttachments(
  part: GmailMessagePart,
): { filename: string; attachmentId: string }[] {
  const results: { filename: string; attachmentId: string }[] = [];

  if (
    part.filename &&
    part.filename.toLowerCase().endsWith(".pdf") &&
    part.body?.attachmentId
  ) {
    results.push({ filename: part.filename, attachmentId: part.body.attachmentId });
  }

  if (part.parts) {
    for (const child of part.parts) {
      results.push(...findPdfAttachments(child));
    }
  }

  return results;
}

/** Renew Gmail push notification watch (expires after 7 days) */
export async function renewWatch(): Promise<{ historyId: string; expiration: string }> {
  const token = await getAccessToken();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || "ifratelli-gmail";
  const topicName = process.env.GOOGLE_PUBSUB_TOPIC || "gmail-factures";
  const labelId = process.env.GMAIL_LABEL_ID;

  const body: Record<string, unknown> = {
    topicName: `projects/${projectId}/topics/${topicName}`,
    labelIds: labelId ? [labelId] : ["INBOX"],
  };

  const res = await fetch(`${GMAIL_API}/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail watch renewal failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return { historyId: data.historyId, expiration: data.expiration };
}
