import { describe, expect, it } from "vitest";
import { localClock, localWindow } from "@/lib/stationTime";

const CDT_NOW = new Date("2026-10-04T20:00:00Z"); // 15:00 in Milwaukee, UTC-5
const CST_NOW = new Date("2026-12-01T20:00:00Z"); // 14:00 in Milwaukee, UTC-6
const window = { startTime: "08:00", endTime: "08:30" };

describe("localWindow", () => {
  it("reads wall-clock time in daylight time (UTC-5)", () => {
    expect(localWindow({ day: "today", ...window }, CDT_NOW)).toEqual({ from: Date.UTC(2026, 9, 4, 13), to: Date.UTC(2026, 9, 4, 13, 30) });
  });
  it("reads wall-clock time in standard time (UTC-6)", () => {
    expect(localWindow({ day: "today", ...window }, CST_NOW)).toEqual({ from: Date.UTC(2026, 11, 1, 14), to: Date.UTC(2026, 11, 1, 14, 30) });
  });
  it("uses the local date, not the UTC date, for 'today'", () => {
    const lateNight = new Date("2026-10-05T03:00:00Z"); // still Oct 4 at 22:00 locally
    expect(localWindow({ day: "today", ...window }, lateNight).from).toBe(Date.UTC(2026, 9, 4, 13));
  });
  it("shifts to the previous local day for 'yesterday'", () => {
    expect(localWindow({ day: "yesterday", ...window }, CDT_NOW).from).toBe(Date.UTC(2026, 9, 3, 13));
  });
  it("is correct across the fall-back change (Nov 1 2026 morning is UTC-6)", () => {
    const now = new Date("2026-11-02T18:00:00Z");
    expect(localWindow({ day: "yesterday", ...window }, now).from).toBe(Date.UTC(2026, 10, 1, 14));
  });
  it("lets a window cross midnight", () => {
    const { from, to } = localWindow({ day: "today", startTime: "23:00", endTime: "00:30" }, CDT_NOW);
    expect(from).toBe(Date.UTC(2026, 9, 5, 4));
    expect(to).toBe(Date.UTC(2026, 9, 5, 5, 30));
  });
  it("rejects malformed times", () => {
    expect(() => localWindow({ day: "today", startTime: "8am", endTime: "09:00" }, CDT_NOW)).toThrow(/HH:MM/);
    expect(() => localWindow({ day: "today", startTime: "08:00", endTime: "24:00" }, CDT_NOW)).toThrow(/HH:MM/);
  });
});

describe("localClock", () => {
  it("formats Milwaukee time for speech", () => {
    expect(localClock(Date.UTC(2026, 9, 4, 13, 12))).toBe("8:12 a.m.");
    expect(localClock(Date.UTC(2026, 11, 1, 22, 5))).toBe("4:05 p.m.");
    expect(localClock(Date.UTC(2026, 9, 4, 5, 0))).toBe("12:00 a.m.");
  });
});
