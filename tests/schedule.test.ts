import { describe, expect, it } from "vitest";
import { renderView } from "@/lib/card";
import { buildMcpHandler, CARD_URI } from "@/lib/mcp";
import { AUTH_TOOLS } from "@/lib/listenerAuth";
import { PlaylistUnavailable, type HostProfile, type PlaylistClient, type ScheduleProgram, type ScheduleSlot, type StationSchedule } from "@/lib/playlist";
import { noScheduleSpeech, SCHEDULE_UNAVAILABLE_SPEECH, spokenOnNow, spokenPrograms, weeklyTimes } from "@/lib/schedule";
import { screenWords } from "@/lib/sim/evalChecks";
import { withoutStationName } from "@/lib/speech";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost } from "./mcp-wire";

// Monday, October 5, 12:30 PM in Milwaukee.
const NOW = new Date("2026-10-05T17:30:00Z");
const XSS = "<script>alert(1)</script>";
const PHOTO = "https://npr.brightspotcdn.com/dims4/default/erin.jpg";

const MIDDAY: ScheduleSlot = {
  name: "88Nine Midday Show", hosts: ["Erin Wolf"], startsAt: Date.parse("2026-10-05T15:00:00Z"), endsAt: Date.parse("2026-10-05T19:00:00Z"),
  imageUrl: null, link: null,
  hostProfiles: [{ name: "Erin Wolf", imageUrl: PHOTO, profileUrl: "https://radiomilwaukee.org/people/erin-wolf", latest: [{ title: "Five new Milwaukee songs to hear this week", url: "https://radiomilwaukee.org/x", publishedAt: Date.parse("2026-10-02T15:00:00Z") }] }],
};
const AFTERNOON: ScheduleSlot = { name: "88Nine Afternoon Drive", hosts: ["Carolann Grzybowski"], startsAt: MIDDAY.endsAt, endsAt: Date.parse("2026-10-05T23:00:00Z") };
const RHYTHM_LAB: ScheduleProgram = {
  name: "Rhythm Lab Radio", hosts: ["Tarik Moody"],
  airtimes: [{ dayOfWeek: 5, startMin: 1320, endMin: 1440, day: "Friday", start: "10 PM", end: "12 AM" }],
  lastAired: null, nextAiring: null, airingNow: false,
};
const TASTE_TEST: ScheduleProgram = {
  name: "Audio Taste Test", hosts: ["Britt Gottschalk"],
  airtimes: [{ dayOfWeek: 4, startMin: 1320, endMin: 1380, day: "Thursday", start: "10 PM", end: "11 PM" }],
  lastAired: { startsAt: Date.parse("2026-10-02T03:00:00Z"), endsAt: Date.parse("2026-10-02T04:00:00Z") },
  nextAiring: { startsAt: Date.parse("2026-10-09T03:00:00Z"), endsAt: Date.parse("2026-10-09T04:00:00Z") },
  airingNow: false,
};
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((day, i) => ({ dayOfWeek: i + 1, startMin: 600, endMin: 840, day, start: "10 AM", end: "2 PM" }));
const MIDDAY_PROGRAM: ScheduleProgram = { name: "88Nine Midday Show", hosts: ["Erin Wolf"], airtimes: WEEKDAYS, lastAired: null, nextAiring: null, airingNow: true };

const schedule = (over: Partial<StationSchedule> = {}): StationSchedule =>
  ({ refreshedAt: NOW.getTime(), station: "88nine", onNow: MIDDAY, next: AFTERNOON, match: null, matches: [], ...over });
const handlerWith = (playlist: PlaylistClient) =>
  buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => playlist, now: () => NOW, defer: (task) => void task(), cardHtml: () => "" });
const call = (args: Record<string, unknown>) => ({ method: "tools/call", params: { name: "station_schedule", arguments: args } });

describe("spoken schedule", () => {
  it("who's on now: host, show, until when, who's next, and the host's latest piece (headline and date)", () => {
    expect(spokenOnNow(schedule())).toBe(
      "Erin Wolf is on the 88Nine Midday Show until 2. Next, Carolann Grzybowski on Afternoon Drive. Latest from Erin Wolf, October 2: Five new Milwaukee songs to hear this week.",
    );
  });

  it("a show with no host, no latest pieces, and nothing scheduled", () => {
    expect(spokenOnNow(schedule({ onNow: { ...AFTERNOON, name: "88Nine Nighttime", hosts: [] }, next: null }))).toBe("88Nine Nighttime is on until 6.");
    expect(spokenOnNow(schedule({ onNow: { ...AFTERNOON, name: "Overnight", hosts: [] }, next: null }))).toBe("Overnight is on 88Nine until 6.");
    expect(spokenOnNow(schedule({ onNow: null, next: null }))).toBe("I don't have 88Nine's schedule right now.");
    expect(spokenOnNow(schedule({ onNow: null }))).toBe("88Nine doesn't have a host on right now. Next, Carolann Grzybowski on Afternoon Drive at 2 PM.");
  });

  it("drops the leading \"88Nine \" only where 88Nine was already said", () => {
    expect(withoutStationName("88Nine Weekends with Mallory Wallace")).toBe("Weekends with Mallory Wallace");
    expect(withoutStationName("Rhythm Lab Radio")).toBe("Rhythm Lab Radio");
    expect(withoutStationName("88Nine")).toBe("88Nine");
    const midday = { ...MIDDAY_PROGRAM, airingNow: false };
    const weekends = { ...RHYTHM_LAB, name: "88Nine Weekends with Mallory Wallace", hosts: ["Mallory Wallace"] };
    expect(spokenPrograms("88nine", [midday, weekends], NOW)).toBe(
      "On 88Nine's schedule: Midday Show with Erin Wolf airs weekdays, 10 AM to 2 PM; Weekends with Mallory Wallace airs Fridays, 10 PM to midnight.",
    );
    expect(spokenPrograms("midday", [midday], NOW)).toBe("88Nine Midday Show with Erin Wolf airs weekdays, 10 AM to 2 PM.");
  });

  it("weekly times read the way a person says them", () => {
    expect(weeklyTimes(RHYTHM_LAB.airtimes)).toBe("Fridays, 10 PM to midnight");
    expect(weeklyTimes(WEEKDAYS)).toBe("weekdays, 10 AM to 2 PM");
    expect(weeklyTimes([...TASTE_TEST.airtimes, { ...TASTE_TEST.airtimes[0], day: "Saturday" }])).toBe("Thursdays and Saturdays, 10 PM to 11 PM");
  });

  it("when is a show on: its host and weekly times", () => {
    expect(spokenPrograms("rhythm lab", [RHYTHM_LAB], NOW)).toBe("Rhythm Lab Radio with Tarik Moody airs Fridays, 10 PM to midnight.");
  });

  it("did I miss it: when it last aired and when it's next, or that it's on now", () => {
    expect(spokenPrograms("audio taste test", [TASTE_TEST], NOW)).toBe(
      "Audio Taste Test with Britt Gottschalk airs Thursdays, 10 PM to 11 PM. It aired Thursday at 10 PM; next is Thursday, October 8 at 10 PM.",
    );
    expect(spokenPrograms("midday", [MIDDAY_PROGRAM], NOW)).toBe("88Nine Midday Show with Erin Wolf airs weekdays, 10 AM to 2 PM. It's on now.");
  });

  it("several shows: three spoken, then the offer of the rest", () => {
    const five = ["A", "B", "C", "D", "E"].map((name) => ({ ...RHYTHM_LAB, name }));
    const first = spokenPrograms("tarik", five, NOW);
    expect(first).toBe("On 88Nine's schedule: A with Tarik Moody airs Fridays, 10 PM to midnight; B with Tarik Moody airs Fridays, 10 PM to midnight; C with Tarik Moody airs Fridays, 10 PM to midnight. Want the next two?");
    expect(spokenPrograms("tarik", five, NOW, 2)).toBe("More from 88Nine's schedule: D with Tarik Moody airs Fridays, 10 PM to midnight; E with Tarik Moody airs Fridays, 10 PM to midnight.");
  });

  it("nothing found, and stations without a schedule, by name", () => {
    expect(spokenPrograms("polka hour", [], NOW)).toBe("I couldn't find \"polka hour\" on 88Nine's schedule.");
    expect(noScheduleSpeech("hyfin")).toBe("I don't have HYFIN's schedule yet.");
    expect(noScheduleSpeech("414music")).toBe("I don't have 414 Music's schedule yet.");
    expect(noScheduleSpeech("rhythmlab")).toBe("I don't have Rhythm Lab's schedule yet.");
  });

  it("never points at a screen", () => {
    const said = [spokenOnNow(schedule()), spokenPrograms("x", [TASTE_TEST, RHYTHM_LAB], NOW), SCHEDULE_UNAVAILABLE_SPEECH, noScheduleSpeech("hyfin")];
    for (const line of said) expect(screenWords(line)).toEqual([]);
  });
});

describe("schedule card", () => {
  it("on now: the host's photo, show, host, until when, Listen live, up next and the latest piece as a link", () => {
    const html = renderView({ view: "schedule", onNow: MIDDAY, next: AFTERNOON, matches: [] });
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).toContain("88Nine Midday Show");
    expect(html).toContain("Erin Wolf");
    expect(html).toContain("until 2 PM");
    expect(html).toContain("Listen live");
    expect(html).toContain("Up next");
    expect(html).toContain("Carolann Grzybowski");
    expect(html).toContain('class="secondary details latest" data-url="https://radiomilwaukee.org/x"');
  });

  it("no photo is a plain tile, and every name is escaped", () => {
    const html = renderView({ view: "schedule", onNow: { ...AFTERNOON, name: `Drive ${XSS}`, hosts: [XSS] }, next: null, matches: [] });
    expect(html).toContain('class="art ph"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("Up next");
  });

  it("matches: one tile each with photo or plain fallback, hosts and weekly times; only https links", () => {
    const withLink = { ...RHYTHM_LAB, hostProfiles: [{ name: "Tarik Moody", imageUrl: PHOTO, profileUrl: null, latest: [{ title: "Good", url: "https://radiomilwaukee.org/y", publishedAt: null }, { title: "Bad", url: "javascript:alert(1)", publishedAt: null }] }] };
    const html = renderView({ view: "schedule", onNow: null, next: null, matches: [withLink, { ...TASTE_TEST, name: `Taste ${XSS}` }] });
    expect(html.match(/class="tile digest sched"/g)).toHaveLength(2);
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).toContain('class="tile-art ph"');
    expect(html).toContain("Fridays, 10 PM to midnight");
    expect(html).toContain('data-url="https://radiomilwaukee.org/y"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
  });
});

describe("station_schedule", () => {
  it("is a card tool that needs no linked account, described for who's on and when", async () => {
    const tools = (await mcpPost(handlerWith(fakePlaylist()), { method: "tools/list" })).message.result.tools;
    const tool = tools.find((t: { name: string }) => t.name === "station_schedule");
    expect(tool._meta.ui.resourceUri).toBe(CARD_URI);
    expect(AUTH_TOOLS as readonly string[]).not.toContain("station_schedule");
    for (const phrase of ["who's on", "who's the DJ", "when is Rhythm Lab on", "did I miss", "on_air_now"]) expect(tool.description).toContain(phrase);
  });

  it("who's on 88Nine: asks 88Nine's schedule for now and speaks host, show and next, with the schedule card", async () => {
    const asked: unknown[] = [];
    const playlist = fakePlaylist({ stationSchedule: async (args) => { asked.push(args); return schedule(); } });
    const { message } = await mcpPost(handlerWith(playlist), call({ station: "88nine" }));
    expect(asked).toEqual([{ station: "88nine", at: NOW.getTime() }]);
    expect(message.result.isError).toBeFalsy();
    expect(message.result.content[0].text).toMatch(/^Erin Wolf is on the 88Nine Midday Show until 2\. Next, Carolann Grzybowski on Afternoon Drive\./);
    expect(message.result.structuredContent.view).toBe("schedule");
  });

  it("other stations say they have no schedule yet, without asking the playlist", async () => {
    let asked = 0;
    const playlist = fakePlaylist({ stationSchedule: async () => { asked += 1; return schedule(); } });
    for (const [station, speech] of [["hyfin", "I don't have HYFIN's schedule yet."], ["414music", "I don't have 414 Music's schedule yet."], ["rhythmlab", "I don't have Rhythm Lab's schedule yet."]]) {
      const { message } = await mcpPost(handlerWith(playlist), call({ station }));
      expect(message.result.content[0].text).toBe(speech);
    }
    expect(asked).toBe(0);
  });

  it("when is Rhythm Lab on: looked up on 88Nine even when the Rhythm Lab station is named", async () => {
    const asked: unknown[] = [];
    const playlist = fakePlaylist({ stationSchedule: async (args) => { asked.push(args); return schedule({ match: RHYTHM_LAB, matches: [RHYTHM_LAB] }); } });
    const { message } = await mcpPost(handlerWith(playlist), call({ station: "rhythmlab", query: "rhythm lab" }));
    expect(asked).toEqual([{ station: "88nine", query: "rhythm lab", at: NOW.getTime() }]);
    expect(message.result.content[0].text).toBe("Rhythm Lab Radio with Tarik Moody airs Fridays, 10 PM to midnight.");
    expect(message.result.structuredContent.cardHtml).toContain("Rhythm Lab Radio");
  });

  it("a missing hostProfile function is tolerated: the answer comes from the schedule", async () => {
    const playlist = fakePlaylist({
      stationSchedule: async () => schedule({ matches: [RHYTHM_LAB] }),
      hostProfile: async () => { throw new PlaylistUnavailable("alexa:hostProfile failed"); },
    });
    const { message } = await mcpPost(handlerWith(playlist), call({ query: "tarik moody" }));
    expect(message.result.isError).toBeFalsy();
    expect(message.result.content[0].text).toBe("Rhythm Lab Radio with Tarik Moody airs Fridays, 10 PM to midnight.");
  });

  it("a host the schedule search misses is answered from the host's profile, with the photo on the card", async () => {
    const profile: HostProfile = { name: "Erin Wolf", imageUrl: PHOTO, profileUrl: null, latest: [], programs: [{ name: "88Nine Midday Show", airtimes: WEEKDAYS }] };
    const playlist = fakePlaylist({ stationSchedule: async () => schedule({ matches: [] }), hostProfile: async () => profile });
    const { message } = await mcpPost(handlerWith(playlist), call({ query: "erin wolf" }));
    expect(message.result.content[0].text).toBe("88Nine Midday Show with Erin Wolf airs weekdays, 10 AM to 2 PM.");
    expect(message.result.structuredContent.cardHtml).toContain(`src="${PHOTO}"`);
  });

  it("a host's latest piece is spoken and shown only from the last 90 days", async () => {
    const piece = (title: string, publishedAt: number | string | null) => ({ title, url: `https://radiomilwaukee.org/${title.length}`, publishedAt });
    const withLatest = (latest: ReturnType<typeof piece>[]) => schedule({ onNow: { ...MIDDAY, hostProfiles: [{ ...MIDDAY.hostProfiles![0], latest }] } });
    const ask = async (latest: ReturnType<typeof piece>[]) => {
      const playlist = fakePlaylist({ stationSchedule: async () => withLatest(latest) });
      return (await mcpPost(handlerWith(playlist), call({}))).message.result;
    };
    const old = await ask([piece("A 2016 byline", "2016-03-01T12:00:00Z"), piece("Undated", null)]);
    expect(old.content[0].text).not.toContain("Latest from");
    expect(old.structuredContent.cardHtml).not.toContain("latest");
    const recent = await ask([piece("Eighty-nine days old", NOW.getTime() - 89 * 86_400_000)]);
    expect(recent.content[0].text).toContain("Latest from Erin Wolf, July 8: Eighty-nine days old.");
    expect(recent.structuredContent.cardHtml).toContain("Eighty-nine days old");
    const stale = await ask([piece("Ninety-one days old", NOW.getTime() - 91 * 86_400_000)]);
    expect(stale.content[0].text).not.toContain("Ninety-one");
  });

  it("a host profile's stale latest piece is not shown on a match tile", async () => {
    const profile: HostProfile = {
      name: "Tarik Moody", imageUrl: PHOTO, profileUrl: null, programs: [],
      latest: [{ title: "Old feature", url: "https://radiomilwaukee.org/old", publishedAt: Date.parse("2016-05-01T12:00:00Z") }],
    };
    const playlist = fakePlaylist({ stationSchedule: async () => schedule({ matches: [RHYTHM_LAB] }), hostProfile: async () => profile });
    const { message } = await mcpPost(handlerWith(playlist), call({ query: "tarik moody" }));
    expect(message.result.structuredContent.cardHtml).toContain(`src="${PHOTO}"`);
    expect(message.result.structuredContent.cardHtml).not.toContain("Old feature");
  });

  it("match tiles get a labelled Add to calendar button per distinct airtime, only when the show has airtimes", () => {
    const html = renderView({ view: "schedule", onNow: null, next: null, matches: [RHYTHM_LAB, MIDDAY_PROGRAM, { ...TASTE_TEST, name: "No Times", airtimes: [] }] });
    expect(html.match(/class="secondary calendar"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Add Rhythm Lab Radio to calendar"');
    expect(html).toContain('aria-label="Add 88Nine Midday Show to calendar"');
    expect(html).toContain("BYDAY%3DFR");
    expect(html).toContain("BYDAY%3DMO%2CTU%2CWE%2CTH%2CFR");
    expect(html).not.toContain("Add No Times to calendar");
  });

  it("the hero's Up next gets an icon-only calendar button; no next means none", () => {
    const html = renderView({ view: "schedule", onNow: MIDDAY, next: AFTERNOON, matches: [] });
    expect(html).toContain('class="secondary calendar small"');
    expect(html).toContain('aria-label="Add 88Nine Afternoon Drive to calendar"');
    expect(renderView({ view: "schedule", onNow: MIDDAY, next: null, matches: [] })).not.toContain("calendar");
  });

  it("photo order: host photo, then the show's, then a plain tile", () => {
    const SHOW_PHOTO = "https://npr.brightspotcdn.com/show.jpg";
    const hero = (slot: ScheduleSlot) => renderView({ view: "schedule", onNow: slot, next: null, matches: [] });
    expect(hero({ ...MIDDAY, imageUrl: SHOW_PHOTO })).toContain(`src="${PHOTO}"`);
    expect(hero({ ...MIDDAY, imageUrl: SHOW_PHOTO, hostProfiles: [{ ...MIDDAY.hostProfiles![0], imageUrl: null }] })).toContain(`src="${SHOW_PHOTO}"`);
    expect(hero({ ...MIDDAY, imageUrl: null, hostProfiles: [] })).toContain('class="art ph"');
  });

  it("schedule down: an apology, flagged as an error", async () => {
    const playlist = fakePlaylist({ stationSchedule: async () => { throw new PlaylistUnavailable("down"); } });
    const { message } = await mcpPost(handlerWith(playlist), call({}));
    expect(message.result.isError).toBe(true);
    expect(message.result.content[0].text).toBe(SCHEDULE_UNAVAILABLE_SPEECH);
  });

  it("the card's CSP allows the schedule's photos", async () => {
    const read = await mcpPost(handlerWith(fakePlaylist()), { method: "resources/read", params: { uri: CARD_URI } });
    expect(read.message.result.contents[0]._meta.ui.csp.resourceDomains).toContain("https://npr.brightspotcdn.com");
  });
});

describe("on_air_now with the schedule", () => {
  const song = { playId: "play_88", title: "Lauren", artist: "Men I Trust", playedAt: NOW.getTime() - 3 * 60_000, artworkUrl: null, previewUrl: null };
  const onAir = (args: Record<string, unknown>) => ({ method: "tools/call", params: { name: "on_air_now", arguments: args } });

  it("88Nine's row names the host and show", async () => {
    const playlist = fakePlaylist({ recentSongs: async () => [song], stationSchedule: async () => schedule() });
    const { message } = await mcpPost(handlerWith(playlist), onAir({ station: "88nine" }));
    expect(message.result.content[0].text).toBe("88Nine (Erin Wolf, Midday Show) is playing \"Lauren\" by Men I Trust. Say 'Alexa, play 88Nine' to keep listening.");
    expect(message.result.structuredContent.cardHtml).toContain("Midday Show with Erin Wolf");
    expect(message.result.structuredContent.cardHtml).not.toContain("88Nine Midday Show");
    const all = await mcpPost(handlerWith(playlist), onAir({}));
    expect(all.message.result.content[0].text).toMatch(/^On air now: 88Nine \(Erin Wolf, Midday Show\) is playing/);
  });

  it("a failing schedule never fails on_air_now", async () => {
    const playlist = fakePlaylist({ recentSongs: async () => [song], stationSchedule: async () => { throw new Error("boom"); } });
    const { message } = await mcpPost(handlerWith(playlist), onAir({ station: "88nine" }));
    expect(message.result.isError).toBeFalsy();
    expect(message.result.content[0].text).toBe("88Nine is playing \"Lauren\" by Men I Trust. Say 'Alexa, play 88Nine' to keep listening.");
  });

  it("another station alone never asks for the schedule", async () => {
    let asked = 0;
    const playlist = fakePlaylist({ recentSongs: async () => [song], stationSchedule: async () => { asked += 1; return schedule(); } });
    await mcpPost(handlerWith(playlist), onAir({ station: "hyfin" }));
    expect(asked).toBe(0);
  });
});
