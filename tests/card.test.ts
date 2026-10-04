import { describe, expect, it } from "vitest";
import type { Story } from "@/lib/backstory";
import { renderView, storyCardPage, TOKENS } from "@/lib/card";

const XSS = "<script>alert(1)</script>";
const place = (name: string, lat: number | null, lng: number | null, address: string | null = null) =>
  ({ name, category: "restaurant", lat, lng, neighborhood: null, quote: "q", address });
const STORY: Story = {
  storyId: "s1", show: "This Bites", title: `Frugal ${XSS} dining`, summary: "Cheap eats.",
  publishedAt: Date.UTC(2026, 8, 4, 15), attribution: "This Bites, September 2026", audioUrl: "https://dovetail.prxu.org/a.mp3",
  permalink: null, imageUrl: "https://f.prxu.org/tb.jpg", mentions: [], topics: [], actions: [],
  places: [
    place("Ted's Ice Cream", 43.06, -87.99, "Ted's Ice Cream, 6204 W North Ave, Milwaukee, WI 53213, United States"),
    place("El Tsunami", 43.0, -87.94, "2001 W Lincoln Ave, Milwaukee, WI 53215, United States"),
    place("Bread House", 42.95, -87.95), place("Hong Anh Palace", 43.2, -87.92), place("Not pinned", null, null),
  ],
  contentType: "episode", song: null,
};

// WCAG relative-luminance contrast.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe("Alexa+ card tokens", () => {
  it("text and the orange action are readable in both themes", () => {
    for (const t of [TOKENS.light, TOKENS.dark]) {
      expect(contrast(t.text, t.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.card)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(TOKENS.onAccent, TOKENS.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("story view (Card pattern)", () => {
  const html = renderView({ view: "story", story: STORY });
  it("escapes story text and carries the logo", () => {
    expect(html).not.toContain(XSS);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('alt="Radio Milwaukee"');
  });
  it("one title, one supporting line, one main action", () => {
    expect(html).toContain("This Bites · September 2026");
    expect(html).toContain("Ted&#39;s Ice Cream, El Tsunami, Bread House and 2 more places");
    expect(html).toContain('class="primary play" data-audio="https://dovetail.prxu.org/a.mp3"');
    expect(html).not.toContain("Cheap eats."); // Alexa speaks the summary; the screen doesn't repeat it
  });
  it("Places for several pinned places, Directions for exactly one, nothing for none", () => {
    expect(html).toContain('class="secondary ask" data-ask="Where are the places from that episode?"');
    const one = renderView({ view: "story", story: { ...STORY, places: [STORY.places[0]] } });
    expect(one).toContain('class="secondary directions"');
    const none = renderView({ view: "story", story: { ...STORY, places: [] } });
    expect(none).not.toMatch(/class="secondary/);
  });
});

describe("quote view", () => {
  it("the quote large, its moment, play-from-here", () => {
    const html = renderView({ view: "quote", story: STORY, passages: [{ text: `They call ${XSS} them stromboli.`, startMs: 645_000, speaker: null }] });
    expect(html).toContain("From the episode · 10:45");
    expect(html).toContain("<blockquote>“They call &lt;script&gt;");
    expect(html).toContain('class="primary play-from" data-start="645" data-audio="https://dovetail.prxu.org/a.mp3"');
  });
});

describe("stories view (Carousel pattern)", () => {
  it("numbered cards that ask for that story when tapped", () => {
    const match = { storyId: "s1", title: `One ${XSS}`, show: "This Bites", showSlug: "this-bites", attribution: "a", publishedAt: Date.UTC(2026, 9, 1, 15), hint: "h", imageUrl: null };
    const html = renderView({ view: "stories", matches: [match, { ...match, storyId: "s2", title: "Two" }] });
    expect(html).not.toContain(XSS);
    expect(html).toContain('<span class="badge">1</span>');
    expect(html).toContain('data-ask="Tell me about the story &quot;Two&quot;"');
    expect(html).toContain("October 1");
  });
});

describe("places view (Map pattern)", () => {
  const map = {
    url: "https://radio-commons.vercel.app/api/map?story=s1&w=300&h=250&n=3&theme=light", w: 300, h: 250,
    badges: [{ label: "1", numbers: [1], x: 118.4, y: 30.5 }, { label: "2·3", numbers: [2, 3], x: 181, y: 127 }],
  };
  const html = renderView({ view: "places", story: STORY, map });
  it("the map with numbered badges where the places are, and a matching list", () => {
    expect(html).toContain(`src="${map.url.replace(/&/g, "&amp;")}"`);
    expect(html).toContain('style="left:118px;top:31px"');
    expect(html).toContain(">2·3</span>");
    expect(html).toContain("6204 W North Ave");
    expect(html).toContain('class="row directions"');
  });
  it("first three in the list, the rest behind See all (fullscreen)", () => {
    expect(html.match(/class="row directions"/g)).toHaveLength(3);
    expect(html).toContain('class="secondary fullscreen">See all 4');
  });
});

describe("the card page", () => {
  const page = storyCardPage("v1.public.MAPKEY");
  it("authors at 768 px and scales to the screen; light/dark from the host", () => {
    expect(page).toContain("/ 768");
    expect(page).toContain("data-theme");
    expect(page).toContain("onhostcontextchanged");
  });
  it("talks to the host only through the bridge: messages, fullscreen, links", () => {
    expect(page).toContain("app.sendMessage(");
    expect(page).toContain("app.requestDisplayMode(");
    expect(page).toContain("app.openLink(");
  });
  it("loads the pan-and-zoom map only for fullscreen, with Amazon's map style", () => {
    expect(page).toContain("maplibre-gl");
    expect(page).toContain("maps.geo.us-east-1.amazonaws.com/v2/styles/Standard/descriptor");
    expect(page).toContain("v1.public.MAPKEY");
  });
  it("embeds only the browser (tiles) key, never the server's map-picture key", () => {
    const before = { ...process.env };
    process.env.AMAZON_LOCATION_API_KEY = "v1.public.SERVERKEY";
    process.env.AMAZON_LOCATION_BROWSER_KEY = "v1.public.BROWSERKEY";
    const html = storyCardPage();
    process.env = before;
    expect(html).toContain("v1.public.BROWSERKEY");
    expect(html).not.toContain("SERVERKEY");
  });
  it("a long quote gets smaller type so Play stays on the card; extra moments stay one line", () => {
    const long = "word ".repeat(56).trim(); // ~280 characters
    const html = renderView({ view: "quote", story: STORY, passages: [{ text: long, startMs: 1000, speaker: null }, { text: long, startMs: 2000, speaker: null }] });
    expect(html).toContain('<blockquote class="q-long">');
    expect(renderView({ view: "quote", story: STORY, passages: [{ text: "Short.", startMs: 1000, speaker: null }] })).toContain("<blockquote>");
    expect(storyCardPage("k")).toMatch(/\.moments span\{[^}]*-webkit-line-clamp:1/);
  });
  it("event tiles: escaped, with time, venue, price or Free, badges, and calendar/details buttons", () => {
    const ev = { id: "e1", title: `Jazz ${XSS}`, startAt: "x", endAt: null, venue: { name: "Jazz <b>Gallery</b>", address: null, lat: 1, lng: 2, neighborhood: null },
      category: "music", isFree: false, priceMin: 15, priceMax: null, imageUrl: null, url: "https://fg.test/e/1", calendarUrl: "https://calendar.google.com/x?a=1&b=2",
      isStationEvent: true, pick: { curator: "Tarik", role: null, blurb: "b" } };
    const html = renderView({ view: "events", items: [{ event: ev, when: "tonight at 8 PM" }] });
    expect(html).not.toContain(XSS);
    expect(html).toContain("Jazz &lt;b&gt;Gallery&lt;/b&gt;");
    expect(html).toContain("tonight at 8 PM");
    expect(html).toContain("$15");
    expect(html).toContain("Staff pick");
    expect(html).toContain('class="secondary calendar" data-url="https://calendar.google.com/x?a=1&amp;b=2"');
    expect(html).toContain('class="secondary details" data-url="https://fg.test/e/1"');
    expect(renderView({ view: "events", items: [{ event: { ...ev, isFree: true, pick: null }, when: "w" }] })).toContain(">Free<");
  });
  it("an event without a photo has no tall empty block: the category sits beside its number", () => {
    const ev = { id: "e1", title: "Jazz", startAt: "x", endAt: null, venue: null, category: "music", isFree: true, priceMin: null, priceMax: null, imageUrl: null,
      url: "https://fg.test/e/1", calendarUrl: "https://calendar.google.com/x", isStationEvent: false, pick: null };
    const html = renderView({ view: "events", items: [{ event: ev, when: "tonight at 8 PM" }] });
    expect(html).not.toContain("tile-art");
    expect(html).toContain('<div class="ev-head"><span class="badge">1</span><span class="ev-cat">music</span>');
  });
  it("the main button becomes Pause while anything plays, and the host can pause the card", () => {
    const page = storyCardPage("k");
    expect(page).toContain('" Pause"');
    expect(page).toContain("radio-commons:pause");
  });
  it("the star is left off when it would cover a numbered pin; event tiles never load outside photos", () => {
    const ev = { id: "e1", title: "Jazz", startAt: "x", endAt: null, venue: { name: "V", address: null, lat: 1, lng: 2, neighborhood: null }, category: "music",
      isFree: true, priceMin: null, priceMax: null, imageUrl: "https://i.ticketweb.com/x.jpg", url: "https://fg.test/e", calendarUrl: "https://calendar.google.com/x", isStationEvent: false, pick: null };
    const over = renderView({ view: "events-map", items: [{ event: ev, when: "w" }], map: { url: "u", w: 300, h: 250, badges: [{ label: "1", numbers: [1], x: 100, y: 100 }], anchor: { x: 104, y: 102, name: "Cactus Club" } } });
    expect(over).not.toContain('class="pin anchor"');
    expect(over).toContain("Near ★ Cactus Club");
    expect(renderView({ view: "events", items: [{ event: ev, when: "w" }] })).not.toContain("i.ticketweb.com");
  });
  it("a place with a booking link gets its own Reserve button beside the row; others don't", () => {
    const booked = { ...STORY, places: [{ ...STORY.places[0], reservationUrl: "https://www.opentable.com/r/teds?a=1&b=2" }, ...STORY.places.slice(1)] };
    const html = renderView({ view: "places", story: booked, map: { url: "u", w: 300, h: 250, badges: [] } });
    expect(html).toContain('class="secondary reserve" data-url="https://www.opentable.com/r/teds?a=1&amp;b=2"');
    expect(html.match(/class="secondary reserve"/g)).toHaveLength(1);
    expect(storyCardPage("k")).toContain('has("reserve")');
  });
});
