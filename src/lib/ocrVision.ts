/**
 * Google Cloud Vision OCR — shared helper.
 * Uses Google OAuth (same credentials as Gmail integration).
 */

let _cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.exp - 60_000) return _cachedToken.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`OAuth token error: ${JSON.stringify(data)}`);
  }
  _cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

/**
 * OCR an image (or single-page PDF rendered as image) via Google Cloud Vision.
 * Returns the full extracted text.
 */
export async function ocrImage(imageBytes: Uint8Array): Promise<string> {
  const token = await getAccessToken();
  const base64 = Buffer.from(imageBytes).toString("base64");

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text ?? "";
  if (!text) {
    const errorInfo = data.responses?.[0]?.error;
    if (errorInfo) throw new Error(`Vision API: ${errorInfo.message}`);
  }
  return text;
}
