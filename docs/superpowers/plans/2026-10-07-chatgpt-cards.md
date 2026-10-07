# ChatGPT cards — implementation plan (slice 2 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Tarik chose native execution in slice 1). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the ChatGPT door, cards look like ChatGPT (the mockups Tarik approved on October 7), fit their content, save a song without a second ChatGPT turn, and keep the live stream playing in picture-in-picture — while Alexa+'s card page stays byte-for-byte the same.

**Architecture:** The chat card page (`chatCardPage`, already serving the ChatGPT door) gets its own stylesheet: the existing base styles followed by chat overrides, with no Figtree and no 768px zoom. The card script gains a `chat` mode: no zoom, Save buttons call `save_find` directly (falling back to a chat message), Listen live asks for picture-in-picture and falls back to opening the stream. Views stay shared; two Save buttons gain a `data-save` attribute that only the chat script reads.

**Tech Stack:** server-rendered HTML views (`src/lib/card/views.ts`), the MCP Apps `App` (`callServerTool`, `requestDisplayMode`, `openLink`, `sendMessage`), vitest, Playwright (screenshots only, from the scratch folder).

**Spec:** `docs/superpowers/specs/2026-10-06-chatgpt-app-design.md` ("The chat card style", "Listen"). **Design sources:** openai/apps-sdk-ui tokens and the pizzaz list/carousel examples (summarised in the session's design-source report); approved mockups in the session scratch folder (`mock/png`).

## Global Constraints

- Alexa+ unchanged: `tests/alexaDoor.test.ts` (6 snapshots, including the `storyCardPage("test-key")` fingerprint) passes untouched after every task.
- No new dependencies in the project. Playwright runs only from the scratch folder.
- OpenAI UI rules: system font only; no logo in the card; system colors for text and surfaces; 88Nine orange `#F7941D` only on primary buttons and number badges; at most two actions per inline card; cards fit their content (no `vh`, no zoom).
- `npm test`, `npm run typecheck`, `npm run build` green before any push. No merge to `main` before October 23. No production deploy.

## Review Focus

1. **A card tool called from the card before sign-in** (direct Save while signed out) must fall back to the chat message, so ChatGPT shows its sign-in screen, never a silent failure. Test: Task 3.
2. **Views the mockups didn't cover** (events, map, digest, finds, saved, schedule, capabilities, quote, premiere, session) must still render legibly with the chat stylesheet in light and dark. Check: Task 2 screenshots.
3. **Fullscreen map** must still work in chat (it relies on `--z` and the base map styles). Check: Task 2 screenshot of the fullscreen view + Task 5 hand test.
4. **Audio refused in the card** must open the stream or episode instead of leaving "Can't play here". Test: Task 4.
5. **Alexa's card page must not gain the chat behaviors.** Test: fingerprint snapshot (every task).

---

### Task 1: Chat stylesheet and a zoom-free chat page

**Files:** Create `src/lib/card/chatStyle.ts`. Modify `src/lib/card/page.ts` (`script`, `chatCardPage`). Test `tests/chatCard.test.ts`.

**Interfaces:** Produces `CHAT_STYLE: string` (chatStyle.ts) and `chatCardPage(mapKey?)` with its own `<head>` (no Google Fonts link). `script(mapKey, chat = false)`; `chat` = read `_meta` + `z = 1`.

- [ ] **Step 1: failing tests** (`tests/chatCard.test.ts`)

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chatCardPage, storyCardPage } from "@/lib/card";

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
```

- [ ] **Step 2:** `npx vitest run tests/chatCard.test.ts` → FAIL (Google Fonts link present, `const z = width / 768;` in chat page).

- [ ] **Step 3: implement.** `chatStyle.ts` exports `CHAT_STYLE`: the approved mockup CSS (scratch `mock/chat.css`, minified) prefixed by overrides that remap the base variables so unmocked views follow ChatGPT's colors:

```ts
// Appended after the base card styles on the ChatGPT door only. Values from openai/apps-sdk-ui; mockups approved 2026-10-07.
export const CHAT_STYLE = `
html[data-theme=light]{--screen:transparent;--card:transparent;--inner:#f3f3f3;--text:#0d0d0d;--muted:#5d5d5d;--secondary:#ededed}
html[data-theme=dark]{--screen:transparent;--card:transparent;--inner:#2a2a2a;--text:#ffffff;--muted:#afafaf;--secondary:#303030}
body{font:400 16px/24px ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;background:transparent}
#root{min-height:0;display:block}
.logo{display:none}
…the approved rules from mock/chat.css, verbatim…`;
```

In `page.ts`: `script(mapKey, chat = false)` replaces `const z = width / 768;` with `const z = ${chat ? "1" : "width / 768"};` and keeps the `_meta` read under the same flag. `chatCardPage` builds its own document: same skeleton as `storyCardPage` minus the Google Fonts `<link>`, `<style>${STYLE}${CHAT_STYLE}</style>`, `script(mapKey, true)`.

- [ ] **Step 4:** `npx vitest run tests/chatCard.test.ts tests/alexaDoor.test.ts tests/chatDoor.test.ts` → PASS; fingerprint unchanged.
- [ ] **Step 5:** commit `feat: chat card stylesheet and zoom-free chat page`.

### Task 2: Visual check of every view in the chat style

**Files:** none in the repo (scratch harness `mock/shoot.mjs`).

- [ ] **Step 1:** Render every `CardView` through `renderView` (fixtures plus the live cards saved in `mock/cards/`) inside `chatCardPage`'s `<style>`, light and dark, 760px and 390px, plus the fullscreen places view. Screenshot with the scratch Playwright.
- [ ] **Step 2:** Read every screenshot. For each view that is illegible, overflowing, or still shows Alexa layout (large fixed frames, per-row buttons beyond two actions), add the smallest CSS override to `CHAT_STYLE`, re-run, and re-check. Record each fix in the ledger.
- [ ] **Step 3:** commit any `CHAT_STYLE` changes: `fix: chat style for <views>`.

### Task 3: Save from the card without a second ChatGPT turn

**Files:** Modify `src/lib/card/views.ts` (`saveSong`, `songsView` save button), `src/lib/card/page.ts` (button handler, chat mode). Test `tests/chatCard.test.ts`.

**Interfaces:** Save buttons carry `data-save='{"title":…,"artist":…,"station"?:…}'` (JSON, HTML-escaped). Chat script: `callServerTool({ name: "save_find", arguments })`.

- [ ] **Step 1: failing tests**

```ts
import { renderView } from "@/lib/card";
it("song Save buttons carry the save_find arguments", () => {
  const html = renderView({ view: "songs", songs: [{ title: "No ID", artist: "Tank and the Bangas", meta: "", artworkUrl: null, previewUrl: null, lines: [] }] });
  const raw = html.match(/data-save="([^"]+)"/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  expect(JSON.parse(raw)).toEqual({ title: "No ID", artist: "Tank and the Bangas" });
});
it("chat Save calls save_find directly and falls back to a chat message when sign-in is needed", () => {
  const page = chatCardPage("k");
  expect(page).toContain('name: "save_find"');
  expect(page).toContain("account_linking_required");
  expect(storyCardPage("k")).not.toContain("callServerTool");
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** Views: add `data-save="${escape(JSON.stringify({ title, artist, ...(station ? { station } : {}) }))}"` to the two Save buttons (the existing `data-ask` stays: Alexa's script uses it). Chat script, before the `ask` branch:

```js
if (CHAT && button.dataset.save) {
  const label = button.textContent;
  button.textContent = "Saving…";
  app.callServerTool({ name: "save_find", arguments: JSON.parse(button.dataset.save) }).then((r) => {
    const signIn = r && r.structuredContent && r.structuredContent.error === "account_linking_required";
    if (!r || r.isError || signIn) { button.textContent = label; return ask(button); } // ChatGPT shows sign-in via the chat turn
    button.textContent = "Saved ✓"; button.disabled = true;
  }).catch(() => { button.textContent = label; ask(button); });
  return;
}
```

where `ask(button)` is the existing `sendMessage` call extracted into a function, and `CHAT` is `${chat}` in the template.
- [ ] **Step 4:** run → PASS; Alexa fingerprint unchanged (the Alexa page has no `CHAT` branch).
- [ ] **Step 5:** commit `feat: Save from the chat card calls save_find directly`.

### Task 4: Listen live — picture-in-picture, and open the audio when the card can't play it

**Files:** Modify `src/lib/card/page.ts` (`playRow`, `play`, chat mode). Test `tests/chatCard.test.ts`.

- [ ] **Step 1: failing tests**

```ts
it("chat Listen live asks for picture-in-picture and returns inline on stop", () => {
  const page = chatCardPage("k");
  expect(page).toContain('requestDisplayMode({ mode: "pip" })');
  expect(page).toContain('requestDisplayMode({ mode: "inline" })');
});
it("chat opens the audio in a new tab when the card isn't allowed to play it", () => {
  expect(chatCardPage("k")).toContain("app.openLink({ url: button.dataset.audio })");
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement (chat mode only).** In `playRow`, after a live stream starts: `if (CHAT && button.classList.contains("live")) app.requestDisplayMode({ mode: "pip" }).catch(() => {});`; when it stops: `app.requestDisplayMode({ mode: "inline" })`. In both `play` and `playRow` `.catch`: `if (CHAT) { app.openLink({ url: button.dataset.audio }).catch(() => {}); return; }` before the "Can't play here" label. ponytail: no once-a-minute now-playing refresh yet — the model answers "who is this?" with a fresh `on_air_now` call; add the refresh if the PiP card looks stale in use.
- [ ] **Step 4:** run → PASS; full `npm test`, typecheck, build.
- [ ] **Step 5:** commit `feat: chat Listen live floats in picture-in-picture; open audio when the card can't play`.

### Task 5: Hand test in ChatGPT (Tarik, with Claude)

- [ ] Claude: push; turn preview protection off (restore value saved); confirm `chatgpt-dev.rmke.org` answers.
- [ ] Tarik, new chat on Radio Milwaukee (dev): "What's playing on 88Nine?" → card fits its content, system font, no logo; **▶ Listen live** → plays and floats (or opens a tab); "Save" on the card → "Saved ✓" without a new ChatGPT turn; "Find the This Bites episode about frugal dining" → single-result card; "What's new at Radio Milwaukee this week?" → list rows open their items; "Where are its places?" → map → fullscreen.
- [ ] Tarik: turn on **enforce CSP in dev mode** (ChatGPT settings) and repeat one card; artwork and audio still load.
- [ ] Claude: turn protection back on; record results in `docs/LEARNING-LOG.md` (expected / happened / believe; Tarik's words where marked).

## Later (unchanged from the spec)

Slice 3 copy pass (chat-worded replies), slice 4 playlists **plus songs in a time window** (new read-only rm-playlist-v2 query; chat lists every play in the window instead of one guess — see spec), slice 5 requests and 5 O'Clock Shadow, slice 6 station home.
