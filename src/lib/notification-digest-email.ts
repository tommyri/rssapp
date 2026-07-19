import {
  createDigestOpenToken,
  createDigestUnsubscribeToken,
  digestOneClickUnsubscribeUrl,
  digestOpenUrl,
  digestUnsubscribeUrl,
} from "@/lib/notification-digest-links";
import { appOrigin } from "@/lib/transactional-email";

export interface NotificationDigestEmailItem {
  notificationId: number;
  title: string | null;
  source: string | null;
  reason: string;
}

export interface NotificationDigestEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

const DISPLAY_LIMIT = 20;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function itemLink(
  userId: number,
  notificationId: number,
  linkCreatedAt: Date,
): string {
  return digestOpenUrl(
    createDigestOpenToken(userId, notificationId, linkCreatedAt),
  );
}

/** Render deterministic HTML/text so a provider idempotency retry is identical. */
export function renderNotificationDigestEmail({
  userId,
  items,
  linkCreatedAt,
  test = false,
}: {
  userId: number;
  items: NotificationDigestEmailItem[];
  linkCreatedAt: Date;
  test?: boolean;
}): NotificationDigestEmail {
  const unsubscribeToken = createDigestUnsubscribeToken(userId, linkCreatedAt);
  const unsubscribeUrl = digestUnsubscribeUrl(unsubscribeToken);
  const oneClickUrl = digestOneClickUnsubscribeUrl(unsubscribeToken);
  const inboxUrl = new URL(
    "/?view=notifications",
    `${appOrigin()}/`,
  ).toString();
  const visible = items.slice(0, DISPLAY_LIMIT);
  const remaining = Math.max(0, items.length - visible.length);
  const countLabel = `${items.length} ${items.length === 1 ? "article" : "articles"}`;
  const subject = test
    ? `Test digest: ${countLabel} from your notifications`
    : `${countLabel} in your rssapp notifications`;

  const textItems = visible.map((item) => {
    const title = item.title?.trim() || "Untitled article";
    const source = item.source?.trim() || "Feed";
    return `${title}\n${source} · Matched ${item.reason}\n${itemLink(userId, item.notificationId, linkCreatedAt)}`;
  });
  const text = [
    test
      ? "This is a test of your rssapp email digest."
      : "Your rule notifications",
    "",
    ...(textItems.length > 0
      ? textItems.flatMap((item, index) =>
          index === textItems.length - 1 ? [item] : [item, ""],
        )
      : ["There are no unread rule notifications right now."]),
    ...(remaining > 0
      ? ["", `And ${remaining} more in your notifications.`]
      : []),
    "",
    `View notifications: ${inboxUrl}`,
    "",
    `Change or stop email digests: ${unsubscribeUrl}`,
  ].join("\n");

  const htmlItems = visible
    .map((item) => {
      const title = escapeHtml(item.title?.trim() || "Untitled article");
      const source = escapeHtml(item.source?.trim() || "Feed");
      const reason = escapeHtml(item.reason);
      const href = escapeHtml(
        itemLink(userId, item.notificationId, linkCreatedAt),
      );
      return `<tr><td style="padding:18px 0;border-bottom:1px solid #e7e5e4"><a href="${href}" style="color:#1c1917;font-size:17px;font-weight:650;line-height:1.35;text-decoration:none">${title}</a><div style="margin-top:6px;color:#78716c;font-size:13px;line-height:1.45">${source} · Matched ${reason}</div></td></tr>`;
    })
    .join("");
  const emptyHtml = `<tr><td style="padding:24px 0;color:#78716c;font-size:15px">There are no unread rule notifications right now.</td></tr>`;
  const moreHtml =
    remaining > 0
      ? `<p style="margin:20px 0 0;color:#78716c;font-size:13px">And ${remaining} more in your notifications.</p>`
      : "";
  const intro = test
    ? "This is a test of your rssapp email digest."
    : "Articles selected by the rules you created.";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f4;color:#1c1917;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(countLabel)} selected by your rules.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e7e5e4;border-radius:12px"><tr><td style="padding:30px"><div style="color:#ea7558;font-size:14px;font-weight:700;letter-spacing:.04em">rssapp.</div><h1 style="margin:12px 0 6px;font-family:Georgia,serif;font-size:28px;line-height:1.2">Your rule notifications</h1><p style="margin:0 0 12px;color:#78716c;font-size:14px;line-height:1.5">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${htmlItems || emptyHtml}</table>${moreHtml}<p style="margin:24px 0 0"><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;background:#ea7558;color:#1c1917;padding:10px 16px;border-radius:7px;font-weight:650;text-decoration:none">View notifications</a></p></td></tr><tr><td style="padding:18px 30px;border-top:1px solid #e7e5e4;color:#a8a29e;font-size:12px;line-height:1.5">You enabled this digest for your verified account email. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#78716c">Change or stop email digests</a>.</td></tr></table></td></tr></table></body></html>`;

  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
