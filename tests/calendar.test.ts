import { describe, expect, it } from "vitest";
import { programCalendarUrl, showCalendarUrl, slotCalendarUrl } from "@/lib/card/calendar";

const params = (url: string | null) => new URL(url!).searchParams;
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

describe("programCalendarUrl", () => {
  const fri = { dayOfWeek: 5, startMin: 1320, endMin: 1440, day: "Friday", start: "10 PM", end: "12 AM" };
  const lab = { name: "Rhythm Lab Radio", hosts: ["Tarik Moody"], nextAiring: null as { startsAt: number; endsAt: number } | null };
  const MON_NOON = new Date("2026-10-05T17:30:00Z"); // Monday 12:30 PM Milwaukee (CDT)

  it("repeats weekly on the airtime's weekday, ending midnight on the next day, in Milwaukee time", () => {
    const url = programCalendarUrl(lab, [fri], MON_NOON);
    const p = params(url);
    expect(p.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=FR");
    expect(p.get("dates")).toBe("20261010T030000Z/20261010T050000Z"); // Fri Oct 9 10 PM to Sat 12 AM CDT
    expect(p.get("text")).toBe("Rhythm Lab Radio on 88Nine");
    expect(p.get("details")).toBe("Hosted by Tarik Moody");
    expect(p.get("location")).toBe("88Nine Radio Milwaukee");
    expect(p.get("ctz")).toBe("America/Chicago");
  });

  it("uses nextAiring when it matches the airtime", () => {
    const nextAiring = { startsAt: Date.parse("2026-10-17T03:00:00Z"), endsAt: Date.parse("2026-10-17T05:00:00Z") };
    expect(params(programCalendarUrl({ ...lab, nextAiring }, [fri], MON_NOON)).get("dates")).toBe("20261017T030000Z/20261017T050000Z");
  });

  it("ignores a nextAiring on a different weekday or time", () => {
    const nextAiring = { startsAt: Date.parse("2026-10-08T03:00:00Z"), endsAt: Date.parse("2026-10-08T04:00:00Z") };
    expect(params(programCalendarUrl({ ...lab, nextAiring }, [fri], MON_NOON)).get("dates")).toBe("20261010T030000Z/20261010T050000Z");
  });

  it("skips a show that already started today and goes to next week", () => {
    const friLate = new Date("2026-10-10T03:30:00Z"); // Fri 10:30 PM CDT, show already on
    expect(params(programCalendarUrl(lab, [fri], friLate)).get("dates")).toBe("20261017T030000Z/20261017T050000Z");
  });

  it("is DST-safe: the Friday after the fall-back Sunday is CST (UTC-6)", () => {
    const sat = new Date("2026-10-31T17:00:00Z"); // Sat Oct 31
    expect(params(programCalendarUrl(lab, [fri], sat)).get("dates")).toBe("20261107T040000Z/20261107T060000Z");
  });

  it("a weekday run is one event with a BYDAY list, one start and end", () => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day, i) => ({ dayOfWeek: i + 1, startMin: 600, endMin: 840, day, start: "10 AM", end: "2 PM" }));
    const p = params(programCalendarUrl({ name: "88Nine Midday Show", hosts: ["Erin Wolf", "Sam Lee"], nextAiring: null }, days, new Date("2026-10-05T14:00:00Z")));
    expect(p.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(p.get("dates")).toBe("20261005T150000Z/20261005T190000Z"); // 10 AM today, not yet started at 9 AM CDT
    expect(p.get("text")).toBe("Midday Show on 88Nine");
    expect(p.get("details")).toBe("Hosted by Erin Wolf & Sam Lee");
  });

  it("adds the show page and escapes special characters", () => {
    const url = programCalendarUrl({ ...lab, name: "Hall & Oates #1", link: "https://radiomilwaukee.org/shows/rl" }, [fri], MON_NOON);
    expect(url).toContain("text=Hall+%26+Oates+%231+on+88Nine");
    expect(params(url).get("details")).toBe("Hosted by Tarik Moody\nhttps://radiomilwaukee.org/shows/rl");
  });

  it("returns null without usable airtimes", () => {
    expect(programCalendarUrl(lab, [], MON_NOON)).toBeNull();
    expect(programCalendarUrl(lab, [{ day: "Friday", start: "10 PM", end: "12 AM" }], MON_NOON)).toBeNull();
  });
});

describe("slotCalendarUrl", () => {
  it("repeats a schedule slot weekly at its own weekday and length", () => {
    const slot = { name: "88Nine Afternoon Drive", hosts: ["Carolann Grzybowski"], startsAt: Date.parse("2026-10-05T19:00:00Z"), endsAt: Date.parse("2026-10-05T23:00:00Z") };
    const p = params(slotCalendarUrl(slot, new Date("2026-10-05T17:30:00Z"))!);
    expect(p.get("text")).toBe("Afternoon Drive on 88Nine");
    expect(p.get("recur")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO");
    expect(p.get("dates")).toBe("20261005T190000Z/20261005T230000Z");
  });
});
