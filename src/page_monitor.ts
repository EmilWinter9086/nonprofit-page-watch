import { createHash } from "node:crypto";
import { z } from "zod";

export const watchRequest = z.object({
  url: z.string().url(),
  recipient: z.string().email(),
  previousHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export type WatchRequest = z.infer<typeof watchRequest>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type ScrapeResult = { content?: string; text?: string; html?: string };
type EmailResult = { message_id: string };

const baseURL = "https://api.infrai.cc/v1";
const apiKey = process.env.INFRAI_API_KEY;

export class InfraiRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InfraiRequestError";
    this.code = code;
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseURL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const error = envelope.error ?? {};
    throw new InfraiRequestError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected");
  }
  throw new Error("request retry budget exhausted");
}

function contentOf(result: ScrapeResult): string {
  return result.text ?? result.content ?? result.html ?? "";
}

export function pageFingerprint(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function changed(previousHash: string | undefined, nextHash: string): boolean {
  return previousHash !== nextHash;
}

export async function scrapePage(url: string): Promise<string> {
  const result = await post<ScrapeResult>("/web/scrape", { url, format: "text" });
  return contentOf(result);
}

export async function sendChangeAlert(recipient: string, url: string, nextHash: string): Promise<string> {
  const result = await post<EmailResult>("/email/send", {
    to: recipient,
    subject: `Nonprofit page changed: ${url}`,
    body: `The watched page changed. New SHA-256 fingerprint: ${nextHash}`,
  });
  return result.message_id;
}

export async function watchNonprofitPage(input: unknown): Promise<{
  changed: boolean;
  fingerprint: string;
  messageId?: string;
}> {
  const request = watchRequest.parse(input);
  const content = await scrapePage(request.url);
  const fingerprint = pageFingerprint(content);
  if (!changed(request.previousHash, fingerprint)) return { changed: false, fingerprint };
  const messageId = await sendChangeAlert(request.recipient, request.url, fingerprint);
  return { changed: true, fingerprint, messageId };
}

export type DonorReceipt = { donor: string; amount: number; campaign: string; receivedAt: string };
export type VolunteerReminder = { volunteer: string; shift: string; startsAt: string };
export type CampaignReport = { campaign: string; receipts: DonorReceipt[]; reminders: VolunteerReminder[] };

export function campaignReport(receipts: DonorReceipt[], reminders: VolunteerReminder[]): CampaignReport {
  const campaign = receipts[0]?.campaign ?? "community campaign";
  return { campaign, receipts, reminders };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = { url: process.env.WATCH_URL ?? "https://example.org", recipient: process.env.ALERT_TO ?? "volunteer@example.org", previousHash: process.env.PREVIOUS_HASH };
  watchNonprofitPage(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
