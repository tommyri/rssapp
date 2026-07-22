import { beforeEach, describe, expect, it } from "vitest";
import { renderNotificationDigestEmail } from "./notification-digest-email";

describe("notification digest email", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://reader.example.com";
    process.env.AUTH_SECRET = "test-secret-with-enough-entropy";
  });

  it("escapes feed-controlled text and includes text and HTML alternatives", () => {
    const email = renderNotificationDigestEmail({
      userId: 4,
      linkCreatedAt: new Date("2026-07-19T10:00:00.000Z"),
      items: [
        {
          notificationId: 91,
          title: "A <script>alert(1)</script>",
          source: "Example & friends",
          reason: "title contains “release”",
        },
      ],
    });

    expect(email.subject).toContain("1 article");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("A <script>alert(1)</script>");
    expect(email.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("caps itemized links while retaining the full digest count", () => {
    const email = renderNotificationDigestEmail({
      userId: 4,
      linkCreatedAt: new Date("2026-07-19T10:00:00.000Z"),
      items: Array.from({ length: 23 }, (_, index) => ({
        notificationId: index + 1,
        title: `Article ${index + 1}`,
        source: "Example",
        reason: "title contains “article”",
      })),
    });

    expect(email.subject).toContain("23 articles");
    expect(email.text).toContain("And 3 more");
    expect(email.text).not.toContain("Article 21\n");
  });
});
