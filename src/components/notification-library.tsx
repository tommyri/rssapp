import { BellIcon, CheckCheckIcon } from "lucide-react";
import {
  markAllNotificationsReadAction,
  openNotificationAction,
} from "@/app/notification-actions";
import { Button } from "@/components/ui/button";
import {
  type NotificationSummary,
  notificationReason,
} from "@/lib/notifications";

export function NotificationLibrary({
  notifications,
  missingNotification = false,
}: {
  notifications: NotificationSummary[];
  missingNotification?: boolean;
}) {
  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <section className="py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <BellIcon className="size-5" aria-hidden />
            <h1 className="font-serif text-3xl font-bold text-foreground">
              Notifications
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Articles your rules flagged for your attention.
          </p>
        </div>
        {hasUnread ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm">
              <CheckCheckIcon className="size-3.5" />
              Mark all read
            </Button>
          </form>
        ) : null}
      </header>

      {missingNotification ? (
        <p className="mt-5 rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
          That notification or its article is no longer available.
        </p>
      ) : null}

      {notifications.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-serif text-lg text-muted-foreground italic">
            Nothing needs your attention yet.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a rule that uses “add to notifications” to collect the articles
            you do not want to miss.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border/70">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <form action={openNotificationAction.bind(null, notification.id)}>
                <button
                  type="submit"
                  className={`group block w-full px-1 py-5 text-left transition-colors hover:bg-accent/35 ${
                    notification.readAt ? "text-muted-foreground" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-2 size-2 shrink-0 rounded-full ${
                        notification.readAt ? "bg-border" : "bg-primary"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">
                        {notification.readAt ? "Read: " : "Unread: "}
                      </span>
                      <span className="block truncate text-base font-medium text-foreground group-hover:underline">
                        {notification.title ?? "Untitled article"}
                      </span>
                      <span className="mt-1 block text-sm">
                        {notification.source ?? "Feed"} · Matched{" "}
                        {notificationReason(notification)}
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        Open article
                      </span>
                    </span>
                  </div>
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
