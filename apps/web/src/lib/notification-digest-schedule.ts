import { Temporal } from "@js-temporal/polyfill";
import type { NotificationDigestCadence } from "@/db/schema";

export interface NotificationDigestSchedule {
  cadence: NotificationDigestCadence;
  timezone: string;
  deliveryHour: number;
  deliveryMinute: number;
  /** ISO weekday: Monday = 1, Sunday = 7. */
  weekday: number;
}

export function isValidDigestTimezone(timezone: string): boolean {
  if (!timezone || timezone.length > 100) return false;
  try {
    Temporal.Now.zonedDateTimeISO(timezone);
    return true;
  } catch {
    return false;
  }
}

function atLocalDeliveryTime(
  date: Temporal.PlainDate,
  schedule: NotificationDigestSchedule,
): Temporal.ZonedDateTime {
  // "compatible" follows the behavior people expect from calendar apps:
  // choose the earlier occurrence when clocks repeat and move forward through
  // a nonexistent wall-clock time when daylight saving starts.
  return Temporal.ZonedDateTime.from(
    {
      timeZone: schedule.timezone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: schedule.deliveryHour,
      minute: schedule.deliveryMinute,
    },
    { disambiguation: "compatible" },
  );
}

/** The first scheduled instant strictly after `now`. */
export function nextNotificationDigestRun(
  schedule: NotificationDigestSchedule,
  now = new Date(),
): Date {
  if (!isValidDigestTimezone(schedule.timezone)) {
    throw new Error("Invalid digest timezone.");
  }
  if (
    !Number.isInteger(schedule.deliveryHour) ||
    schedule.deliveryHour < 0 ||
    schedule.deliveryHour > 23 ||
    !Number.isInteger(schedule.deliveryMinute) ||
    schedule.deliveryMinute < 0 ||
    schedule.deliveryMinute > 59 ||
    !Number.isInteger(schedule.weekday) ||
    schedule.weekday < 1 ||
    schedule.weekday > 7
  ) {
    throw new Error("Invalid digest schedule.");
  }

  const instant = Temporal.Instant.fromEpochMilliseconds(now.getTime());
  const localNow = instant.toZonedDateTimeISO(schedule.timezone);
  let date = localNow.toPlainDate();

  if (schedule.cadence === "weekly") {
    const daysUntil = (schedule.weekday - localNow.dayOfWeek + 7) % 7;
    date = date.add({ days: daysUntil });
  }

  let candidate = atLocalDeliveryTime(date, schedule);
  if (Temporal.ZonedDateTime.compare(candidate, localNow) <= 0) {
    candidate = atLocalDeliveryTime(
      date.add({ days: schedule.cadence === "daily" ? 1 : 7 }),
      schedule,
    );
  }

  return new Date(candidate.epochMilliseconds);
}
