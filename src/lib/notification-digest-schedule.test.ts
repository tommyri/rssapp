import { describe, expect, it } from "vitest";
import {
  isValidDigestTimezone,
  nextNotificationDigestRun,
} from "./notification-digest-schedule";

describe("notification digest scheduling", () => {
  it("schedules a daily digest at the reader's local wall-clock time", () => {
    expect(
      nextNotificationDigestRun(
        {
          cadence: "daily",
          timezone: "Europe/Oslo",
          deliveryHour: 8,
          deliveryMinute: 30,
          weekday: 1,
        },
        new Date("2026-07-19T05:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-07-19T06:30:00.000Z");
  });

  it("moves to the following week after this week's slot has passed", () => {
    expect(
      nextNotificationDigestRun(
        {
          cadence: "weekly",
          timezone: "Europe/Oslo",
          deliveryHour: 8,
          deliveryMinute: 0,
          weekday: 1,
        },
        new Date("2026-07-20T07:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-07-27T06:00:00.000Z");
  });

  it("keeps the local time stable across a daylight-saving transition", () => {
    expect(
      nextNotificationDigestRun(
        {
          cadence: "daily",
          timezone: "Europe/Oslo",
          deliveryHour: 8,
          deliveryMinute: 0,
          weekday: 1,
        },
        new Date("2026-10-24T07:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-10-25T07:00:00.000Z");
  });

  it("rejects unknown timezones", () => {
    expect(isValidDigestTimezone("Europe/Definitely-Not-A-City")).toBe(false);
  });
});
