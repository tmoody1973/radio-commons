import { describe, expect, it } from "vitest";
import { cleanTicketUrl, renderView } from "@/lib/card";
import type { FindRow, SavedFind } from "@/lib/playlist";

const XSS = "<script>alert(1)</script>";
const ARTWORK = "https://is1-ssl.mzstatic.com/image/thumb/Music/{w}x{h}bb.jpg";
const SHOW_PHOTO = "https://s1.ticketm.net/dam/a/1f6/tank_RETINA_PORTRAIT_16_9.jpg";
// Tue Oct 20 2026, 8 PM in Madison (Central time).
const SHOW_AT = Date.parse("2026-10-21T01:00:00Z");

const find = (overrides: Partial<FindRow> = {}): FindRow => ({
  label: "1", findId: "f1", playId: "p1", trackId: "t1", artist: "Tank and the Bangas", title: "No ID",
  stationSlug: "88nine", savedAt: Date.parse("2026-10-04T17:00:00Z"), appleMusic: { status: "added", reason: null },
  artworkUrl: ARTWORK, previewUrl: "https://audio-ssl.itunes.apple.com/p.m4a", ...overrides,
});

type SavedOk = Extract<SavedFind, { status: "ok" }>;
const saved = (overrides: Partial<SavedOk> = {}): SavedOk => ({
  status: "ok", findId: "f1", appleMusic: "pending", artist: "Tank and the Bangas", title: "No ID", alreadySaved: false,
  artistId: "a1", artistName: "Tank and the Bangas", firstFollow: false, nextShow: null, story: null, recentlySaved: false, ...overrides,
});
const SHOW = { venue: "Majestic Theatre", city: "Madison", startsAtMs: SHOW_AT, imageUrl: SHOW_PHOTO, ticketUrl: "https://www.ticketmaster.com/event/07006?camefrom=x#top" };

describe("cleanTicketUrl", () => {
  it("drops tracking from Ticketmaster, Live Nation and AXS links, keeping the path", () => {
    expect(cleanTicketUrl("https://www.ticketmaster.com/tank/event/07006?camefrom=CFC&brand=x#a")).toBe("https://www.ticketmaster.com/tank/event/07006");
    expect(cleanTicketUrl("https://concerts.livenation.com/e/1?utm_source=x")).toBe("https://concerts.livenation.com/e/1");
    expect(cleanTicketUrl("https://www.axs.com/events/1/tank?skin=x")).toBe("https://www.axs.com/events/1/tank");
  });
  it("keeps other https links whole", () => {
    expect(cleanTicketUrl("https://majesticmadison.com/tickets?id=7")).toBe("https://majesticmadison.com/tickets?id=7");
  });
  it("does not mistake a lookalike host for the family", () => {
    expect(cleanTicketUrl("https://notticketmaster.com/e?x=1")).toBe("https://notticketmaster.com/e?x=1");
  });
  it("refuses anything that is not https", () => {
    for (const bad of ["javascript:alert(1)", "http://www.ticketmaster.com/e", "data:text/html,hi", "not a url", "", null, undefined]) {
      expect(cleanTicketUrl(bad)).toBeNull();
    }
  });
});

describe("finds view", () => {
  const finds = [
    find(),
    find({ label: "2", title: `Big ${XSS}`, artist: "Thao", stationSlug: "hyfin", appleMusic: { status: "pending", reason: null }, artworkUrl: null, previewUrl: null }),
    find({ label: "3", appleMusic: { status: "expired", reason: null } }),
    find({ label: "4", appleMusic: { status: "not_linked", reason: null } }),
    find({ label: "5", appleMusic: { status: "failed", reason: "no catalog match" } }),
  ];
  const html = renderView({ view: "finds", finds });
  it("numbers each tile by its label, so 'number 2' matches the screen", () => {
    expect(html.match(/class="tile song find"/g)).toHaveLength(5);
    expect(html.match(/<span class="badge">(\d)<\/span>/g)).toEqual(["1", "2", "3", "4", "5"].map((n) => `<span class="badge">${n}</span>`));
  });
  it("sizes Apple artwork and falls back to a plain tile", () => {
    expect(html).toContain("600x600bb.jpg");
    expect(html).toContain('class="tile-art ph"');
  });
  it("shows the station and the Milwaukee date it was saved", () => {
    expect(html).toContain("88Nine · Oct 4");
    expect(html).toContain("HYFIN · Oct 4");
  });
  it("shows an Apple Music chip per status, and none when not linked or failed", () => {
    expect(html.match(/In Apple Music/g)).toHaveLength(1);
    expect(html.match(/Adding…/g)).toHaveLength(1);
    expect(html.match(/Reconnect Apple Music/g)).toHaveLength(1);
    expect(html.match(/class="chip/g)).toHaveLength(3);
  });
  it("offers a preview only where there is one, and Tell me more on every tile", () => {
    expect(html.match(/class="secondary row-play"/g)).toHaveLength(4);
    expect(html.match(/Tell me more/g)).toHaveLength(5);
    expect(html).toContain('data-ask="Tell me about &quot;No ID&quot; by Tank and the Bangas"');
  });
  it("escapes listener-visible text", () => {
    expect(html).not.toContain(XSS);
    expect(html).toContain("Big &lt;script&gt;");
  });
});

describe("saved view", () => {
  it("confirms the save with artwork, title, artist, preview and the Apple line", () => {
    const html = renderView({ view: "saved", saved: saved(), artworkUrl: "https://is1-ssl.mzstatic.com/a/600x600bb.jpg", previewUrl: "https://audio-ssl.itunes.apple.com/p.m4a" });
    expect(html).toContain("✓ Saved to your Finds");
    expect(html).toContain("Adding to Apple Music");
    expect(html).toContain("<h2>No ID</h2>");
    expect(html).toContain("Tank and the Bangas");
    expect(html).toContain('class="primary play" data-audio="https://audio-ssl.itunes.apple.com/p.m4a"');
    expect(html).not.toContain("Next show");
    expect(html).not.toContain("Following");
  });
  it("uses a plain tile and no preview when the song's artwork is unknown", () => {
    const html = renderView({ view: "saved", saved: saved({ appleMusic: "not_linked" }), artworkUrl: null, previewUrl: null });
    expect(html).toContain('class="art ph"');
    expect(html).not.toContain("data-audio");
    expect(html).toContain("Connect Apple Music to add songs to your library");
  });
  it("says it was already there when it was", () => {
    expect(renderView({ view: "saved", saved: saved({ alreadySaved: true }), artworkUrl: null, previewUrl: null })).toContain("Already in your Finds");
  });
  it("shows the next show with its photo, venue, Milwaukee date and time, and a clean ticket link", () => {
    const html = renderView({ view: "saved", saved: saved({ nextShow: SHOW }), artworkUrl: null, previewUrl: null });
    expect(html).toContain("Next show");
    expect(html).toContain(`src="${SHOW_PHOTO}"`);
    expect(html).toContain("Majestic Theatre · Madison");
    expect(html).toContain("Tue Oct 20 · 8:00 p.m.");
    expect(html).toContain('class="secondary tickets" data-url="https://www.ticketmaster.com/event/07006"');
  });
  it("the next show has an Add to calendar button, even without tickets", () => {
    const html = renderView({ view: "saved", saved: saved({ nextShow: { venue: "Turner Hall", city: "Milwaukee", startsAtMs: SHOW_AT } }), artworkUrl: null, previewUrl: null });
    expect(html).toContain('class="secondary calendar small" data-url="https://calendar.google.com/calendar/render?action=TEMPLATE&amp;text=Tank+and+the+Bangas+at+Turner+Hall');
    expect(html).toContain('aria-label="Add Tank and the Bangas at Turner Hall to calendar"');
  });
  it("shows a show without a photo or tickets as a plain row with no button", () => {
    const html = renderView({ view: "saved", saved: saved({ nextShow: { venue: "Turner Hall", city: "Milwaukee", startsAtMs: SHOW_AT } }), artworkUrl: null, previewUrl: null });
    expect(html).toContain("Turner Hall · Milwaukee");
    expect(html).toContain('class="thumb ph"');
    expect(html).not.toContain("Get tickets");
  });
  it("drops a ticket link that is not https", () => {
    const html = renderView({ view: "saved", saved: saved({ nextShow: { ...SHOW, ticketUrl: "javascript:alert(1)" } }), artworkUrl: null, previewUrl: null });
    expect(html).not.toContain("Get tickets");
    expect(html).not.toContain("javascript:");
  });
  it("offers the story and says it is following, when it is", () => {
    const html = renderView({ view: "saved", saved: saved({ firstFollow: true, story: { storyId: "s1", title: "t", show: "Studio Milwaukee" } }), artworkUrl: null, previewUrl: null });
    expect(html).toContain('data-ask="Play the Studio Milwaukee story about Tank and the Bangas"');
    expect(html).toContain("Their Studio Milwaukee story");
    expect(html).toContain("Following Tank and the Bangas ✓");
  });
  it("escapes everything", () => {
    const html = renderView({ view: "saved", saved: saved({ title: XSS, artistName: XSS, firstFollow: true, nextShow: { ...SHOW, venue: XSS } }), artworkUrl: null, previewUrl: null });
    expect(html).not.toContain(XSS);
  });
});

describe("digest show with a photo and tickets", () => {
  const artists = [{ artistId: "a1", name: "Tank and the Bangas", artworkUrl: "https://is1-ssl.mzstatic.com/artist.jpg" }];
  const show = { kind: "show" as const, artistId: "a1", artist: "Tank and the Bangas", venue: "Majestic Theatre", city: "Madison", startsAtMs: SHOW_AT };
  it("puts the event photo on the artist's tile and a Get tickets button", () => {
    const html = renderView({ view: "digest", artists, items: [{ ...show, imageUrl: SHOW_PHOTO, ticketUrl: "https://www.axs.com/events/1?skin=x" }] });
    expect(html).toContain(`src="${SHOW_PHOTO}"`);
    expect(html).not.toContain("artist.jpg");
    expect(html).toContain('class="secondary tickets" data-url="https://www.axs.com/events/1"');
  });
  it("the show line gets an Add to calendar button", () => {
    const html = renderView({ view: "digest", artists, items: [{ ...show, imageUrl: null, ticketUrl: null }] });
    expect(html).toContain('class="secondary calendar small"');
    expect(html).toContain('aria-label="Add Tank and the Bangas at Majestic Theatre to calendar"');
  });
  it("keeps the artist artwork and no button without them", () => {
    const html = renderView({ view: "digest", artists, items: [{ ...show, imageUrl: null, ticketUrl: null }] });
    expect(html).toContain("artist.jpg");
    expect(html).not.toContain("Get tickets");
  });
});
