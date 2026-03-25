import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getAccessToken(): Promise<string> {
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
    if (!data.access_token)
          throw new Error("Token error: " + JSON.stringify(data));
    return data.access_token;
  }

export async function POST() {
    try {
          const project = process.env.GOOGLE_CLOUD_PROJECT ?? "ifratelli-gmail";
          const topic = process.env.GOOGLE_PUBSUB_TOPIC ?? "gmail-factures";
          const topicName = `projects/${project}/topics/${topic}`;
          const token = await getAccessToken();

          const res = await fetch(
                  "https://gmail.googleapis.com/gmail/v1/users/me/watch",
                  {
                            method: "POST",
                            headers: {
                                        Authorization: `Bearer ${token}`,
                                        "Content-Type": "application/json",
                                      },
                            body: JSON.stringify({ topicName, labelIds: process.env.GMAIL_LABEL_ID ? [process.env.GMAIL_LABEL_ID] : ["INBOX"] }),
                          }
                );

          const data = await res.json();
          if (!res.ok)
                  return NextResponse.json(
                            { error: "Watch failed", details: data },
                            { status: res.status }
                          );

          return NextResponse.json({
                  ok: true,
                  historyId: data.historyId,
                  expiration: data.expiration,
                  expirationDate: new Date(parseInt(data.expiration)).toISOString(),
                  topicName,
                });
        } catch (e) {
          return NextResponse.json(
                  { error: e instanceof Error ? e.message : "Unknown error" },
                  { status: 500 }
                );
        }
  }

export async function GET() {
    return POST();
  }
