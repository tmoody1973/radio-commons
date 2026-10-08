import { describe, expect, it } from "vitest";
import { chatCardPage, renderView, storyCardPage } from "@/lib/card";
import { CHAT_STYLE } from "@/lib/card/chatStyle";
import { STORY } from "./fixtures";

// The ChatGPT door's card page (approved mockups, 2026-10-07). Alexa's page is pinned by tests/alexaDoor.test.ts.
describe("chat card page", () => {
  const page = chatCardPage("k");

  it("uses the system font, no Figtree or Google Fonts", () => {
    expect(page).not.toContain("fonts.googleapis.com");
    expect(page).toContain("ui-sans-serif, -apple-system, system-ui");
  });

  it("fits its content: no zoom, no viewport-height minimum", () => {
    expect(page).toContain("const z = 1;");
    expect(page).toContain("#root{min-height:0;display:block}");
  });

  it("hides the logo (ChatGPT shows the app name itself)", () => {
    expect(page).toContain(".logo{display:none}");
  });

  it("still reads card HTML from _meta", () => {
    expect(page).toContain("...result._meta");
  });

  it("leaves the Alexa page alone", () => {
    const alexa = storyCardPage("k");
    expect(alexa).toContain("fonts.googleapis.com");
    expect(alexa).toContain("const z = width / 768;");
  });
});

// Save from the card calls save_find directly (no extra ChatGPT turn); sign-in or any failure falls back to the
// chat message, so ChatGPT can show its sign-in screen. Alexa's card keeps the chat-message path only.
describe("Save from the card", () => {
  const saveArgs = (html: string) => html.match(/data-save="([^"]+)"/g)!.map((m) => JSON.parse(m.slice(11, -1).replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'")));

  it("song list Save buttons carry the save_find arguments", () => {
    const html = renderView({ view: "songs", songs: [{ title: "No ID", artist: "Tank and the Bangas", meta: "", artworkUrl: null, previewUrl: null, lines: [] }] });
    expect(saveArgs(html)).toEqual([{ title: "No ID", artist: "Tank and the Bangas" }]);
  });

  it("on-air Save carries the station too, and survives quotes in titles", () => {
    const song = { playId: "p1", artist: "Tank & the Bangas", title: `"Quotes" & 'more'`, playedAt: 0, when: "now", artworkUrl: null, previewUrl: null };
    const html = renderView({ view: "on-air", tiles: [{ station: "hyfin", song, show: null }] } as never);
    expect(saveArgs(html)).toEqual([{ title: `"Quotes" & 'more'`, artist: "Tank & the Bangas", station: "hyfin" }]);
  });

  it("the chat page calls save_find and falls back to the chat message on sign-in or failure", () => {
    const page = chatCardPage("k");
    expect(page).toContain('name: "save_find"');
    expect(page).toContain("account_linking_required");
    expect(page).toContain("return ask(button)");
  });

  it("only shows Saved when save_find says ok (not_found is not an error, so it must fall back too)", () => {
    expect(chatCardPage("k")).toContain('r.structuredContent.status === "ok"');
  });

  // Only our script: the embedded MCP Apps library itself defines callServerTool.
  const ownScript = (page: string) => page.split("const App = ")[1];
  it("the Alexa page never calls tools from the card", () => {
    expect(ownScript(storyCardPage("k"))).not.toContain("callServerTool");
    expect(ownScript(chatCardPage("k"))).toContain("callServerTool");
  });
});

// Listen live keeps playing while the listener chats (picture-in-picture); audio the card can't play opens instead.
describe("Listen in the chat card", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  it("Listen live asks for picture-in-picture and returns inline when it stops", () => {
    const chat = ownScript(chatCardPage("k"));
    expect(chat).toContain('requestDisplayMode({ mode: "pip" })');
    expect(chat).toContain('requestDisplayMode({ mode: "inline" })');
  });
  it("opens the audio in a new tab when the card isn't allowed to play it", () => {
    expect(ownScript(chatCardPage("k"))).toContain("app.openLink({ url: button.dataset.audio })");
  });
  it("Alexa's card does neither", () => {
    const alexa = ownScript(storyCardPage("k"));
    expect(alexa).not.toContain('mode: "pip"');
    expect(alexa).not.toContain("url: button.dataset.audio");
  });
});

// Fixes from the slice 2 review (2026-10-07).
describe("review fixes", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  const chat = ownScript(chatCardPage("k"));
  const alexa = ownScript(storyCardPage("k"));

  it("1. --card stays a real surface color (fullscreen panel, warn chip and anchor pin use it); only .card is transparent", () => {
    expect(CHAT_STYLE).not.toContain("--card:transparent");
    expect(CHAT_STYLE).toContain("--card:#ffffff");
    expect(CHAT_STYLE).toContain("--card:#212121");
  });

  it("2. fullscreen map on phones: side list becomes a bottom sheet and the fit padding follows the panel", () => {
    expect(CHAT_STYLE).toMatch(/@media \(max-width:600px\)\{[^}]*\.side\{/);
    expect(chat).toContain("padding: chatMapPadding()");
    expect(alexa).toContain("padding: { top: 100 * z, bottom: 40 * z, left: 40 * z, right: 340 * z }");
  });

  it("3. an interrupted play (AbortError) never opens a tab", () => {
    expect(chat).toContain('e.name === "AbortError"');
  });

  it("5. after any redraw (picture-in-picture, theme), the playing button and Saved marks come back", () => {
    expect(chat).toContain("restoreChatState()");
    expect(chat).toContain("savedKeys.add(button.dataset.save)");
    expect(alexa).not.toContain("restoreChatState");
  });
});

it("keyboard users can see which tile has focus (apps-sdk-ui focus ring)", () => {
  expect(CHAT_STYLE).toContain(".tile:focus-visible{outline:2px solid var(--focus);outline-offset:2px}");
});

it("a tool result without a card leaves the chat card empty (ChatGPT's reply explains); Alexa keeps its message", () => {
  const own = (page: string) => page.split("const App = ")[1];
  expect(own(chatCardPage("k"))).toContain('{ root.textContent = ""; return; }');
  expect(own(storyCardPage("k"))).toContain('{ root.textContent = "Story unavailable."; return; }');
});

it("events (never pictured) are a list in chat, and tile buttons are 28px, not Alexa's 48px", () => {
  expect(CHAT_STYLE).toContain(".carousel:has(> .tile.event){flex-direction:column");
  expect(CHAT_STYLE).toContain(".tile-actions .secondary{min-height:0");
});

// Places on a story card opens the map card in place on the ChatGPT door (no extra ChatGPT turn); Alexa asks as before.
describe("Places from the story card", () => {
  const own = (page: string) => page.split("const App = ")[1];
  const twoPlaces = { ...STORY, places: [STORY.places[0], { ...STORY.places[0], name: "Bread House", lat: 43.02, lng: -88.02 }] };

  it("the Places button carries the get_station_story call for the map view", () => {
    const html = renderView({ view: "story", story: twoPlaces } as never);
    const raw = html.match(/data-call="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    expect(JSON.parse(raw)).toEqual({ name: "get_station_story", arguments: { storyId: STORY.storyId, view: "places" } });
    expect(html).toContain('data-ask="Where are the places from that episode?"');
  });

  it("the chat card calls it and swaps in the map card; anything else falls back to the chat message", () => {
    const chat = own(chatCardPage("k"));
    expect(chat).toContain("button.dataset.call");
    expect(chat).toContain("current = next;");
    expect(own(storyCardPage("k"))).not.toContain("dataset.call");
  });
});

it("the chat card declares it supports inline, fullscreen and picture-in-picture at startup; Alexa's declares nothing", () => {
  const own = (page: string) => page.split("const App = ")[1];
  expect(own(chatCardPage("k"))).toContain('{ availableDisplayModes: ["inline", "fullscreen", "pip"] }');
  expect(own(storyCardPage("k"))).toContain('new App({ name: "radio-commons-story-card", version: "0.2.0" }, {});');
});

it("while a live stream plays, the chat on-air card refreshes what's on every minute; Alexa's never does", () => {
  const own = (page: string) => page.split("const App = ")[1];
  const chat = own(chatCardPage("k"));
  expect(chat).toContain('name: "on_air_now"');
  expect(chat).toContain("setInterval(refreshOnAir, 60000)");
  expect(chat).toContain("startLiveRefresh()");
  expect(own(storyCardPage("k"))).not.toContain("refreshOnAir");
});

describe("request cards", () => {
  const callOf = (html: string) => JSON.parse(html.match(/data-call="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'"));

  it("the preview shows exactly what will be sent, and Send carries the sealed token", () => {
    const html = renderView({ view: "request", request: { kind: "five_oclock_shadow", song: "Hurt", artist: "Nine Inch Nails", coverArtist: "Johnny Cash", note: "Every day" }, token: "tok123" } as never);
    expect(html).toContain("5 O&#39;Clock Shadow suggestion");
    expect(html).toContain("Hurt");
    expect(html).toContain("Cover by Johnny Cash");
    expect(html).toContain("Originally by Nine Inch Nails");
    expect(html).toContain("Every day");
    expect(callOf(html)).toEqual({ name: "send_station_request", arguments: { token: "tok123" } });
  });

  it("listener text can't inject markup", () => {
    const html = renderView({ view: "request", request: { kind: "song_request", song: "<script>x</script>", artist: "a" }, token: "t" } as never);
    expect(html).not.toContain("<script>");
  });

  it("the status card says plainly what happened", () => {
    expect(renderView({ view: "request-status", ok: true, title: "Sent to Radio Milwaukee ✓", detail: "Song request: No ID" } as never)).toContain("Sent to Radio Milwaukee ✓");
  });
});

it("the request preview shows who it's from, or that no name is given", () => {
  expect(renderView({ view: "request", request: { kind: "song_request", song: "No ID", artist: "Tank", fromName: "Tarik from Bay View" }, token: "t" } as never)).toContain("From: Tarik from Bay View");
  expect(renderView({ view: "request", request: { kind: "song_request", song: "No ID", artist: "Tank" }, token: "t" } as never)).toContain("From: name not given");
});

describe("playlist cards", () => {
  const calls = (html: string) => [...html.matchAll(/data-call="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'")));
  const item = { itemId: "i1", playId: "p1", trackId: null, artist: "Tank and the Bangas", title: "No ID", stationSlug: "hyfin", addedAt: 5, artworkUrl: null, previewUrl: null };

  it("one playlist: name, count, each song with Remove that calls remove_from_playlist from the card", () => {
    const html = renderView({ view: "playlist", playlistId: "pl1", name: "Road Trip", items: [item] } as never);
    expect(html).toContain("Road Trip");
    expect(html).toContain("1 song");
    expect(html).toContain("No ID");
    expect(calls(html)).toEqual([{ name: "remove_from_playlist", arguments: { playlist: "pl1", itemId: "i1" } }]);
  });

  it("an empty playlist says how to add songs", () => {
    expect(renderView({ view: "playlist", playlistId: "pl1", name: "Road Trip", items: [] } as never)).toContain("No songs yet");
  });

  it("the list of playlists: each row opens its playlist from the card", () => {
    const html = renderView({ view: "playlists", playlists: [{ playlistId: "pl1", name: "Road Trip", itemCount: 3, updatedAt: 5 }] } as never);
    expect(html).toContain("3 songs");
    expect(calls(html)).toEqual([{ name: "show_playlists", arguments: { playlist: "pl1" } }]);
  });

  it("names can't inject markup", () => {
    expect(renderView({ view: "playlist", playlistId: "pl1", name: "<img src=x onerror=1>", items: [] } as never)).not.toContain("<img src=x");
  });
});

describe("station home header", () => {
  const html = renderView({ view: "home", tiles: [], episodes: null, briefing: null, finds: null } as never);
  it("has the station name and a link to the site, and says where to support, with no logo and no donate button", () => {
    expect(html).toContain("Radio Milwaukee");
    expect(html).toContain('class="link details" data-url="https://radiomilwaukee.org"');
    expect(html).toContain("Support us at radiomilwaukee.org");
    expect(html).not.toMatch(/donat/i);
    expect(html.split("On air now")[0]).not.toContain("<img");
  });
  it("has four Try asking questions that send as the listener's message", () => {
    const asks = [...html.matchAll(/class="try ask" data-ask="([^"]+)"/g)].map((m) => m[1]);
    expect(asks).toHaveLength(4);
    expect(html.indexOf("Try asking")).toBeLessThan(html.indexOf("On air now"));
  });
});

describe("article card (newsletter Read, in ChatGPT)", () => {
  const article = {
    id: "g-s921-1", title: "Weekend guide: <spooks>", teaser: "Oktoberfests wrap up.", publishedAt: Date.parse("2026-10-01T12:00:00Z"),
    url: "https://radiomilwaukee.org/events-festivals/x", image: { url: "https://npr.brightspotcdn.com/w.jpg", caption: "Dance Fest", credit: "Nō Studios" },
    blocks: [
      { kind: "para", lines: ["Every week, Milwaukee With Kids answers a simple question for families across the area: what are we going to do this weekend?"], lead: false },
      { kind: "heading", text: "Featured pick" },
      { kind: "para", lines: ["Milwaukee Oktoberfest", "Henry Maier Festival Park", "Oct. 2-4"], lead: true },
      ...Array.from({ length: 6 }, (_, i) => ({ kind: "para", lines: [`Paragraph ${i} `.repeat(20)], lead: false })),
      { kind: "heading", text: "Animals in action" },
      { kind: "para", lines: ["Family Free Day", "Milwaukee County Zoo", "Oct 3"], lead: true },
    ],
  };
  const inline = renderView({ view: "article", article } as never);
  const full = renderView({ view: "article", article, full: true } as never);

  it("inline: photo, date, escaped headline, teaser, the opening, and two actions", () => {
    expect(inline).toContain('src="https://npr.brightspotcdn.com/w.jpg"');
    expect(inline).toContain("October 1");
    expect(inline).toContain("Weekend guide: &lt;spooks&gt;");
    expect(inline).toContain("Oktoberfests wrap up.");
    expect(inline).toContain("Every week, Milwaukee With Kids");
    expect(inline).not.toContain("Family Free Day");
    expect(inline).toContain('class="primary fullscreen"');
    expect(inline).toContain('class="secondary details" data-url="https://radiomilwaukee.org/events-festivals/x"');
  });
  it("the article text isn't in a .body block (the shared style makes .body a side-by-side row)", () => {
    expect(inline).not.toContain('class="body"');
    expect(full).not.toContain('class="body"');
  });
  it("inline never ends on a heading", () => {
    expect(inline.trimEnd()).not.toMatch(/<h3[^>]*>[^<]*<\/h3><\/div><div class="actions">/);
  });
  it("full screen: every block, headings, event lines kept apart, caption and credit, and the site link", () => {
    expect(full).toContain("Animals in action");
    expect(full).toContain("<b>Family Free Day</b><br>Milwaukee County Zoo<br>Oct 3");
    expect(full).toContain("Dance Fest");
    expect(full).toContain("Nō Studios");
    expect(full).toContain('data-url="https://radiomilwaukee.org/events-festivals/x"');
    expect(full).not.toContain("fullscreen");
  });
});

describe("newsletter Read in ChatGPT", () => {
  it("a page item asks ChatGPT to open the article here (chat only); Alexa still opens the link", () => {
    const html = renderView({ view: "briefing", date: "Oct. 1", items: [{ heading: "Weekend guide", url: "https://radiomilwaukee.org/x", summary: "s", action: { kind: "page", url: "https://radiomilwaukee.org/x" } }] } as never);
    expect(html).toContain('class="secondary details" data-url="https://radiomilwaukee.org/x"');
    expect(html).toContain('data-chat-ask="Open the newsletter article &quot;Weekend guide&quot; here"');
  });
});

describe("beta label and feedback", () => {
  it("the home says Beta and offers Send feedback (not one of the four Try asking chips)", () => {
    const html = renderView({ view: "home", tiles: [], episodes: null, briefing: null, finds: null } as never);
    expect(html).toContain('<span class="beta">Beta</span>');
    expect(html).toContain('data-ask="I&#39;d like to send feedback about the Radio Milwaukee app"');
    expect([...html.matchAll(/class="try ask"/g)]).toHaveLength(4);
  });
  it("the feedback preview shows the words, the name and Send", () => {
    const html = renderView({ view: "request", request: { kind: "feedback", message: "The map <b>didn't</b> open", fromName: "Tarik" }, token: "tok" } as never);
    expect(html).toContain("Beta feedback · to Radio Milwaukee");
    expect(html).toContain("The map &lt;b&gt;didn&#39;t&lt;/b&gt; open");
    expect(html).toContain("From: Tarik");
    expect(html).toContain('data-ask="Send my feedback to Radio Milwaukee"');
  });
});

// 2026-10-08: from the fullscreen home, a tap sent its prompt to the thread hidden behind the app ("Working for 14s",
// then nothing in view). openai/mcp-extensions ui/message: target "new" opens a new chat (desktop and web only).
describe("a tap's answer lands where the listener can see it", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  const chat = ownScript(chatCardPage("k"));

  it("from fullscreen it opens a new chat, when ChatGPT supports it and it isn't a phone", () => {
    expect(chat).toContain('"openai/message": { target: "new" }');
    expect(chat).toContain('ctx.displayMode === "fullscreen"');
    expect(chat).toContain('caps.experimental["openai/message"]');
    expect(chat).toContain('ctx.platform !== "mobile"');
  });

  it("every prompt from the card goes through that one path", () => {
    expect(chat.split("app.sendMessage(").length - 1).toBe(1);
  });

  it("the tapped button shows it's working right away", () => {
    expect(chat).toContain('button.classList.add("sending")');
    expect(CHAT_STYLE).toContain("button.sending");
  });

  it("Alexa's card is unchanged", () => {
    expect(ownScript(storyCardPage("k"))).not.toContain("openai/message");
  });
});

describe("deep links", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  it("the chat card follows openai/deepLink to a section, once per link", () => {
    const chat = ownScript(chatCardPage("k"));
    expect(chat).toContain('["openai/deepLink"]');
    expect(chat).toContain('"/on-air/hyfin":"on-air-hyfin"');
    expect(chat).toContain("scrollIntoView");
  });
  it("Alexa's card doesn't", () => {
    expect(ownScript(storyCardPage("k"))).not.toContain("openai/deepLink");
  });
});

// 2026-10-08: a regex written inside the page's template string came out as "//" (a comment) and would have broken
// every button; checks on the script's text didn't notice. Parse the page's own script (the part after the bundle).
describe("the card pages' scripts are valid JavaScript", () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (body: string) => unknown;
  const ownScript = (page: string) => `const App = ${page.split("const App = ")[1].split("</script>")[0]}`;
  it.each([["ChatGPT", chatCardPage("k")], ["Alexa", storyCardPage("k")]])("%s", (_name, page) => {
    expect(() => new AsyncFunction(ownScript(page))).not.toThrow();
  });
});

describe("a card the listener opened from another card", () => {
  const ownScript = (page: string) => page.split("const App = ")[1];
  it("keeps where they came from and shows Back to it (story from the home, map from the story)", () => {
    const chat = ownScript(chatCardPage("k"));
    expect(chat).toContain("cardHistory.push(current)");
    expect(chat).toContain('has("back")');
    expect(chat).toContain("cardHistory = []");
  });
  it("the newsletter's story Play opens the story the same way", () => {
    const html = renderView({ view: "briefing", date: "Oct. 1", items: [{ heading: "Playtime's over", url: "https://radiomilwaukee.org/x", summary: "s", action: { kind: "story", storyId: "s1", title: "Brewers" } }] });
    expect(html).toContain("&quot;get_station_story&quot;");
    expect(html).toContain("&quot;storyId&quot;:&quot;s1&quot;");
  });
});
