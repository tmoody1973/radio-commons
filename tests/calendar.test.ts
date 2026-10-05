import { describe, expect, it } from "vitest";
import { showCalendarUrl } from "@/lib/card/calendar";

const params = (url: string) => new URL(url).searchParams;
const TIMED = { artist: "Tank and the Bangas", venue: "Majestic Theatre", city: "Madison", startsAtMs: Date.parse("2026-10-05T14:00:00Z") };

describe("showCalendarUrl", () => {
  it("builds Field Guide's Google Calendar link for a timed show: UTC start, three hours long", () => {
    const url = showCalendarUrl({ ...TIMED, ticketUrl: "https://www.ticketmaster.com/event/1?camefrom=x" });
    expect(url).toBe("https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tank+and+the+Bangas+at+Majestic+Theatre"
      + "&dates=20261005T140000Z%2F20261005T170000Z&details=https%3A%2F%2Fwww.ticketmaster.com%2Fevent%2F1&location=Majestic+Theatre%2C+Madison&ctz=America%2FChicago");
  });

  it("leaves details out when there is no usable ticket link", () => {
    expect(params(showCalendarUrl(TIMED)).has("details")).toBe(false);
    expect(params(showCalendarUrl({ ...TIMED, ticketUrl: "javascript:alert(1)" })).has("details")).toBe(false);
  });

  it("makes a date-only show an all-day event on the day the card shows", () => {
    const url = showCalendarUrl({ ...TIMED, startsAtMs: Date.UTC(2026, 9, 24), dateOnly: true });
    expect(params(url).get("dates")).toBe("20261024/20261025");
  });

  it("an all-day show at the end of a month rolls the end date over", () => {
    expect(params(showCalendarUrl({ ...TIMED, startsAtMs: Date.UTC(2026, 9, 31), dateOnly: true })).get("dates")).toBe("20261031/20261101");
  });

  it("a late Milwaukee show keeps its real UTC instant across the day boundary", () => {
    // 8 PM Tuesday in Milwaukee is 1 AM Wednesday UTC; the calendar converts it back with ctz.
    const url = showCalendarUrl({ ...TIMED, startsAtMs: Date.parse("2026-10-21T01:00:00Z") });
    expect(params(url).get("dates")).toBe("20261021T010000Z/20261021T040000Z");
  });

  it("encodes special characters in names", () => {
    const url = showCalendarUrl({ artist: "Hall & Oates", venue: "Pabst #2 / Riverside", city: "Milwaukee", startsAtMs: TIMED.startsAtMs });
    expect(url).toContain("text=Hall+%26+Oates+at+Pabst+%232+%2F+Riverside");
    expect(params(url).get("location")).toBe("Pabst #2 / Riverside, Milwaukee");
  });
});
