import { Resend } from "resend";
import { renderWeeklyDigestHtml, type WeeklyDigest } from "./weeklyDigest";

const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL;
const resendReplyTo = process.env.RESEND_REPLY_TO;

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendApiKey) {
    throw new Error("Missing RESEND_API_KEY.");
  }

  if (!resendClient) {
    resendClient = new Resend(resendApiKey);
  }

  return resendClient;
}

export function isResendConfigured() {
  return Boolean(resendApiKey && resendFromEmail);
}

export async function sendWeeklyDigestEmail(
  to: string,
  digest: WeeklyDigest,
  options?: { idempotencyKey?: string },
) {
  if (!resendFromEmail) {
    throw new Error("Missing RESEND_FROM_EMAIL.");
  }

  const resend = getResendClient();
  const html = renderWeeklyDigestHtml(digest);

  const { data, error } = await resend.emails.send({
    from: resendFromEmail,
    to: [to],
    subject: digest.subject,
    html,
    text: [
      digest.intro,
      "",
      ...digest.highlights.map((item) => `- ${item}`),
      "",
      digest.rediscovery ? `Rediscovery: ${digest.rediscovery.summary}` : "",
    ].filter(Boolean).join("\n"),
    replyTo: resendReplyTo || undefined,
    tags: [
      { name: "product", value: "screensort" },
      { name: "automation", value: "weekly-digest" },
    ],
    headers: options?.idempotencyKey
      ? {
          "Idempotency-Key": options.idempotencyKey,
        }
      : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
