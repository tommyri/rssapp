export class EmailDeliveryError extends Error {
  readonly retryable: boolean;

  constructor(
    message = "Email delivery is not configured.",
    { retryable = false }: { retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "EmailDeliveryError";
    this.retryable = retryable;
  }
}

export function appOrigin(): string {
  const configured = process.env.APP_URL;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailDeliveryError(
        "APP_URL must be set to send account email.",
      );
    }
    return "http://localhost:3000";
  }

  try {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new EmailDeliveryError("APP_URL must use https in production.");
    }
    return url.origin;
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError("APP_URL must be a valid absolute URL.");
  }
}

export function isEmailDeliveryAvailable(): boolean {
  return (
    isEmailDeliveryConfigured() ||
    (process.env.NODE_ENV !== "production" &&
      !process.env.RESEND_API_KEY &&
      !process.env.EMAIL_FROM)
  );
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function accountEmailUrl(path: string, token: string): string {
  const url = new URL(path, `${appOrigin()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  /** Stable for one logical message; Resend keeps keys for 24 hours. */
  idempotencyKey?: string;
}

export async function sendEmailMessage({
  to,
  subject,
  text,
  html,
  headers,
  idempotencyKey,
}: EmailMessage): Promise<{ providerMessageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Local development must stay usable without a mail account. The full link
  // appears only in the local server log, never in an HTTP response.
  if (!apiKey && !from && process.env.NODE_ENV !== "production") {
    console.info(`[email:development] to=${to} subject=${subject}\n${text}`);
    return { providerMessageId: null };
  }
  if (!apiKey || !from) {
    throw new EmailDeliveryError(
      "Set RESEND_API_KEY and EMAIL_FROM to send account email.",
    );
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        ...(html ? { html } : {}),
        ...(headers ? { headers } : {}),
      }),
    });
  } catch (error) {
    console.error("[email] delivery request failed:", error);
    throw new EmailDeliveryError("The email service could not be reached.", {
      retryable: true,
    });
  }

  if (!response.ok) {
    console.error("[email] delivery rejected:", response.status);
    throw new EmailDeliveryError("The email service rejected this message.", {
      retryable:
        response.status === 408 ||
        response.status === 409 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500,
    });
  }

  const body = (await response.json().catch(() => null)) as {
    id?: unknown;
  } | null;
  return {
    providerMessageId: typeof body?.id === "string" ? body.id : null,
  };
}

export async function sendVerificationEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}): Promise<void> {
  const link = accountEmailUrl("/verify-email", token);
  await sendEmailMessage({
    to,
    subject: "Verify your rssapp email",
    text: `Verify your email to keep your rssapp account secure:\n\n${link}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}): Promise<void> {
  const link = accountEmailUrl("/reset-password", token);
  await sendEmailMessage({
    to,
    subject: "Reset your rssapp password",
    text: `Use this link to set a new rssapp password:\n\n${link}\n\nThis link expires in 1 hour. If you did not request it, you can ignore this email.`,
  });
}

export async function sendEmailChangeVerification({
  to,
  token,
}: {
  to: string;
  token: string;
}): Promise<void> {
  const link = accountEmailUrl("/verify-email", token);
  await sendEmailMessage({
    to,
    subject: "Confirm your new rssapp email",
    text: `Confirm this email address for your rssapp account:\n\n${link}\n\nYour current address stays active until you use this link. It expires in 1 hour.`,
  });
}

export async function sendAccountInvitationEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}): Promise<void> {
  const url = new URL("/signup", `${appOrigin()}/`);
  url.searchParams.set("invite", token);
  await sendEmailMessage({
    to,
    subject: "You’re invited to rssapp",
    text: `You have been invited to join an rssapp reader:\n\n${url}\n\nThis invitation expires in 7 days. If you were not expecting it, you can ignore this email.`,
  });
}
