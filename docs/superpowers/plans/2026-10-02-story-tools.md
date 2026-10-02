# Radio Commons slice 1: station story tools for Alexa+ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A listener asks Alexa+ about a half-remembered Radio Milwaukee story; the Radio Commons MCP server finds it in Backstory, answers by voice with its source, and shows a story card on screens.

**Architecture:** Backstory (Convex, existing repo `~/Projects/backstory`) gains a per-story `imageUrl` and a story-level search over published stories. A new Next.js app `~/Projects/radio-commons` on Vercel serves one MCP endpoint (`/api/mcp`) with `mcp-handler` 2.x; its two tools read Backstory server-side through `ConvexHttpClient` and return a spoken answer, structured data, and an MCP App story card (`ui://radio-commons/story-card.html`).

**Tech Stack:** Next.js (App Router) on Vercel; `mcp-handler` ^2.2 with `@modelcontextprotocol/server` ^2.2 (protocols 2025-11-25 and 2026-07-28); `@modelcontextprotocol/ext-apps` ^2.0.3 (server helpers + `app-with-deps` bundle); `convex` (HTTP client); zod ^4.2; Vitest. Backstory: Convex, convex-test, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-story-tools-design.md` (approved by Tarik 2026-10-02). Concept: `~/Projects/alexa/docs/plans/2026-09-03-radio-commons-concept.md`.

## Global Constraints

- MCP over **Streamable HTTP**, protocol **2025-11-25** must work (Alexa+); `mcp-handler` 2.x serves it through its stateless legacy fallback ("GET/DELETE session operations answer `405`").
- **Round-trip response under 500 ms** (Amazon quickstart); target ≤ 400 ms p95 measured from Vercel. One Backstory query per tool call; no AI model calls inside tools; Backstory call aborts at **350 ms**.
- Alexa reads **only editor-published data**, only through Backstory **public queries**, only server-side. Never expose the Convex URL or Convex functions to Alexa+ clients.
- Every station record carries **`stationId`**; slice 1 has one station: `"radiomilwaukee"`.
- Spoken answers: speak only from the returned record; always say the show and month; describe the summary as Radio Milwaukee's; never invent a story.
- Audio URLs: strip the `https://dts.podtrac.com/redirect.mp3/` tracking hop (ad blockers block it).
- Card CSP `resourceDomains`: `https://f.prxu.org` (images), `https://dovetail.prxu.org`, `https://dovetail-cdn.prxu.org` (audio).
- Hackathon: repo needs setup and run instructions; required tech "imported and actually called" at runtime; submission due **Fri Oct 23, 2026, 12:00 PT**.
- Backstory `main` and (after Task 4) `radio-commons` `main` are protected: changes land through PRs with green CI.
- **No production writes during implementation** except where a step says **PROD** and Tarik has said yes: deploying Backstory functions, Backstory backfills, creating the GitHub repo, creating/deploying the Vercel project, `alexa-ai deploy`.
- **Ruling recorded in this plan:** the spec says to prefer a PRX-feed episode image when it differs from the show artwork. On 2026-10-02 every feed episode image was identical to the show artwork, so slice 1 stores the CDS series `image-square` asset only; `// ponytail:` comment names the upgrade (compare the feed's `itunes:image` per episode).
- **Ruling recorded in this plan:** the spec's `matchedOn` field is named `hint` (the first sentence of the published summary, ≤ 140 chars). "Matched on" implied telling the listener *which field* matched, which a Convex search index does not report.

## Review Focus

1. **A story is published, then the editor removes a place or marks the episode keep-off-Alexa.** Expected: `searchStoryCards` stops matching on that place / stops returning the story immediately. Test: Task 2, "search follows edits after publishing".
2. **A listener's words match nothing, or match only unpublished stories.** Expected: an honest "I couldn't find…" with zero matches, never a guess. Tests: Task 2 privacy test; Task 5 "find returns an honest no-match".
3. **Backstory is slow or down.** Expected: within ~350 ms the tool answers "I can't reach Radio Milwaukee's stories right now", with no partial data. Test: Task 3 "aborts a slow Backstory call".
4. **Story text containing `<`, `&` or quotes reaches the card.** Expected: shown as text, never executed. Test: Task 6 "escapes story text in the card".
5. **A story with no places, no actions or no image.** Expected: the spoken answer offers "hear the episode" instead of directions; the card hides empty sections and shows no broken image. Tests: Task 4 "offers the episode when there is no place"; Task 6 "card hides empty sections".

---

## File Map

| Repo | File | Responsibility |
|---|---|---|
| backstory | `convex/lib/cds.ts` | `seriesImageUrl(doc)` |
| backstory | `convex/ingest.ts` | fetch the series doc once per run; pass `imageUrl`; refresh show image |
| backstory | `convex/stories.ts` | `upsertEpisode` stores `imageUrl`; `setShowImage` backfill |
| backstory | `convex/lib/storySearch.ts` | `storySearchText(...)`, `refreshStorySearch(ctx, storyId)`, `firstSentence(...)` |
| backstory | `convex/schema.ts` | `stories.imageUrl`, `stories.searchText`, search index `search_story` |
| backstory | `convex/public.ts` | `getStory` returns `imageUrl`; new `searchStoryCards` |
| backstory | `convex/reviewMutations.ts`, `convex/admin.ts` | call `refreshStorySearch` after publish/edits; `refreshAllStorySearch` backfill |
| radio-commons | `src/lib/stations.ts` | station config |
| radio-commons | `src/lib/backstory.ts` | server-side Backstory client with timeout + zod |
| radio-commons | `src/lib/speech.ts` | spoken answers, month labels, audio URL cleanup |
| radio-commons | `src/lib/card.ts` | card inner-HTML renderer (escaping) and the MCP App page |
| radio-commons | `src/lib/mcp.ts` | `buildMcpHandler(deps)`: registers tools + card resource |
| radio-commons | `src/app/api/mcp/route.ts` | mounts the handler with real deps |
| radio-commons | `tests/*.test.ts`, `tests/mcp-wire.ts` | unit + contract tests |
| radio-commons | `.github/workflows/ci.yml`, `README.md`, `docs/decisions/001-…md` | CI, setup/run docs, decision record |

---

### Task 1: Backstory stores a story image

**Repo:** `~/Projects/backstory`. Branch: `git checkout main && git pull --ff-only && git checkout -b feat/story-cards`.

**Files:**
- Modify: `convex/lib/cds.ts`, `convex/schema.ts` (stories), `convex/stories.ts`, `convex/ingest.ts`, `convex/public.ts` (`getStory` return)
- Test: `tests/lib/cds.test.ts`, `tests/stories.test.ts`, `tests/public.test.ts`

**Interfaces:**
- Produces: `seriesImageUrl(doc: { assets?: Record<string, { enclosures?: { href: string; rels?: string[] }[] }> }): string | null`; `internal.stories.setShowImage({ showSlug, imageUrl }) → { updated: number }`; `getStory(...).imageUrl: string | null`.

- [ ] **Step 1: Failing tests**

`tests/lib/cds.test.ts` (append):
```ts
describe("seriesImageUrl", () => {
  it("picks the square artwork from a CDS series document", () => {
    const doc = { assets: { "718414860-image": { enclosures: [
      { href: "https://f.prxu.org/13497/images/x/wide.jpg", rels: ["primary"] },
      { href: "https://f.prxu.org/13497/images/x/square.jpg", rels: ["primary", "image-square"] },
    ] } } };
    expect(seriesImageUrl(doc)).toBe("https://f.prxu.org/13497/images/x/square.jpg");
  });
  it("falls back to the primary image, then to null", () => {
    expect(seriesImageUrl({ assets: { a: { enclosures: [{ href: "https://f.prxu.org/p.jpg", rels: ["primary"] }] } } })).toBe("https://f.prxu.org/p.jpg");
    expect(seriesImageUrl({})).toBeNull();
  });
});
```
(add `seriesImageUrl` to the file's import from `../../convex/lib/cds`).

`tests/stories.test.ts` (append):
```ts
describe("story images", () => {
  it("setShowImage gives every story of a show the show's artwork", async () => {
    const t = makeTest();
    const a = await seedStory(t, { cdsId: "a" });
    const b = await seedStory(t, { cdsId: "b", showSlug: "uniquely-milwaukee" });
    const result = await t.mutation(internal.stories.setShowImage, { showSlug: "this-bites", imageUrl: "https://f.prxu.org/tb.jpg" });
    expect(result.updated).toBe(1);
    expect((await t.run((ctx) => ctx.db.get("stories", a)))?.imageUrl).toBe("https://f.prxu.org/tb.jpg");
    expect((await t.run((ctx) => ctx.db.get("stories", b)))?.imageUrl).toBeUndefined();
  });
});
```

`tests/public.test.ts` (append inside an existing approved-story test file pattern):
```ts
describe("getStory image", () => {
  it("returns the story's image, or null", async () => {
    const t = makeTest();
    const storyId = await seedStory(t, { imageUrl: "https://f.prxu.org/tb.jpg" });
    await saveRun(t, storyId, "run-1");
    await t.mutation(internal.admin.approveLatestRunForDemo, { storyId });
    expect((await t.query(api.public.getStory, { storyId }))?.imageUrl).toBe("https://f.prxu.org/tb.jpg");
  });
});
```

- [ ] **Step 2: Run, expect failure** — `npx vitest run tests/lib/cds.test.ts tests/stories.test.ts tests/public.test.ts` → FAIL (`seriesImageUrl` / `setShowImage` / `imageUrl` missing).

- [ ] **Step 3: Implement**

`convex/lib/cds.ts`:
```ts
/** A podcast series' artwork from its CDS document: the square image, else the primary one. */
// ponytail: series artwork only; per-episode PRX feed images were identical to it on 2026-10-02. Compare the feed's itunes:image per episode if that changes.
export function seriesImageUrl(doc: { assets?: Record<string, { enclosures?: { href: string; rels?: string[] }[] }> }): string | null {
  const enclosures = Object.values(doc.assets ?? {}).flatMap((asset) => asset.enclosures ?? []);
  const square = enclosures.find((e) => e.rels?.includes("image-square"));
  return (square ?? enclosures.find((e) => e.rels?.includes("primary")))?.href ?? null;
}
```
`convex/schema.ts`, in `stories`: `imageUrl: v.optional(v.string()), // show artwork (CDS series image-square)`.
`convex/stories.ts`: add `imageUrl: v.optional(v.string())` to `upsertEpisode` args; on existing stories patch `{ title, teaserText, ...(episode.imageUrl ? { imageUrl: episode.imageUrl } : {}) }`; insert passes it through. Add:
```ts
// A show has at most a few hundred episodes in Backstory (archive backfill is ~377 for This Bites).
const MAX_STORIES_PER_SHOW = 1000;

/** Backfill: give every story of a show its current artwork. */
export const setShowImage = internalMutation({
  args: { showSlug: v.string(), imageUrl: v.string() },
  handler: async (ctx, { showSlug, imageUrl }) => {
    const stories = await ctx.db.query("stories").withIndex("by_showSlug_and_publishedAt", (q) => q.eq("showSlug", showSlug)).take(MAX_STORIES_PER_SHOW);
    let updated = 0;
    for (const story of stories) {
      if (story.imageUrl === imageUrl) continue;
      await ctx.db.patch("stories", story._id, { imageUrl });
      updated++;
    }
    return { updated };
  },
});
```
`convex/ingest.ts` `ingestShow`: after the token check,
```ts
    const series = (await fetchCds(buildDocumentUrl(profile.cdsCollectionId), token)) as { resources?: CdsDocument[] };
    const imageUrl = series.resources?.[0] ? seriesImageUrl(series.resources[0]) : null;
```
pass `...(imageUrl ? { imageUrl } : {})` into `upsertEpisode`, and after the loop `if (imageUrl) await ctx.runMutation(internal.stories.setShowImage, { showSlug, imageUrl });`. Extend `CdsDocument.assets` type if needed so it type-checks (series assets carry `enclosures` with `rels`). Do the same series fetch in `ingestEpisodes`.
`convex/public.ts` `getStory` return object: add `imageUrl: story.imageUrl ?? null,`.

- [ ] **Step 4: Run, expect pass; full suite; typecheck** — `npx vitest run && npm run typecheck`.

- [ ] **Step 5: Commit** — `git add convex tests && git commit -m "feat: store each story's show artwork and return it from getStory"`.

---

### Task 2: Backstory story-level search over published stories

**Files:**
- Create: `convex/lib/storySearch.ts`, `tests/storySearch.test.ts`
- Modify: `convex/schema.ts`, `convex/public.ts`, `convex/reviewMutations.ts`, `convex/admin.ts`

**Interfaces:**
- Consumes: `approveRun` (existing), `normalizeForMatch` (`convex/lib/evidence.ts`), `attribution` (`convex/lib/attribution.ts`), `getShowProfile`.
- Produces:
  - `storySearchText(parts: { title: string; summary: string; topics: string[]; placeNames: string[] }): string`
  - `firstSentence(text: string, max = 140): string`
  - `refreshStorySearch(ctx: MutationCtx, storyId: Id<"stories">): Promise<void>`
  - `api.public.searchStoryCards({ text: string; showSlug?: string }) → { storyId, title, show, showSlug, attribution, publishedAt, hint, imageUrl }[]` (≤ 5)
  - `internal.admin.refreshAllStorySearch({}) → { refreshed: number }`

- [ ] **Step 1: Failing tests** — `tests/storySearch.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { firstSentence, storySearchText } from "../convex/lib/storySearch";
import { makeTest, saveRun, seedStory, type TestConvex } from "./helpers";

const REVIEWER = { email: "editor@example.org", emailVerified: true, subject: "u", issuer: "https://clerk.test" };
beforeEach(() => { process.env.BACKSTORY_REVIEWER_EMAILS = "editor@example.org"; });
afterEach(() => { delete process.env.BACKSTORY_REVIEWER_EMAILS; });

async function published(t: TestConvex, overrides = {}) {
  const storyId = await seedStory(t, { stage: "geocoded", ...overrides });
  await saveRun(t, storyId, "run-1");
  await t.run((ctx) => ctx.db.patch("stories", storyId, { stage: "geocoded" }));
  await t.run(async (ctx) => {
    for (const p of await ctx.db.query("places").take(10)) await ctx.db.patch("places", p._id, { geocodeConfidence: 0.9, lat: 43, lng: -87.9 });
  });
  await t.withIdentity(REVIEWER).mutation(api.reviewMutations.approveEpisode, { storyId, runId: "run-1", summary: "The hosts preview a festival. They visit a cafe." });
  return storyId;
}

describe("storySearchText / firstSentence", () => {
  it("joins title, summary, topics and places into one normalized string", () => {
    expect(storySearchText({ title: "Café Corazón", summary: "A farewell.", topics: ["food-drink"], placeNames: ["Bay View"] })).toBe("cafe corazon a farewell food drink bay view");
  });
  it("cuts the hint at the first sentence", () => {
    expect(firstSentence("The hosts preview a festival. They visit a cafe.")).toBe("The hosts preview a festival.");
  });
});

describe("public.searchStoryCards", () => {
  it("finds a published story by words in its summary", async () => {
    const t = makeTest();
    const storyId = await published(t);
    const [hit] = await t.query(api.public.searchStoryCards, { text: "festival" });
    expect(hit).toMatchObject({ storyId, show: "This Bites", hint: "The hosts preview a festival." });
  });
  it("never returns an unpublished or keep-off-Alexa story", async () => {
    const t = makeTest();
    const draft = await seedStory(t, { cdsId: "draft" });
    await saveRun(t, draft, "run-1");
    expect(await t.query(api.public.searchStoryCards, { text: "festival" })).toEqual([]);
    const storyId = await published(t, { cdsId: "live" });
    await t.withIdentity(REVIEWER).mutation(api.reviewMutations.setDoNotUse, { target: { table: "stories", id: storyId }, doNotUse: true });
    expect(await t.query(api.public.searchStoryCards, { text: "festival" })).toEqual([]);
  });
  it("search follows edits after publishing: a removed place stops matching", async () => {
    const t = makeTest();
    await published(t);
    expect(await t.query(api.public.searchStoryCards, { text: "Corazón" })).toHaveLength(1);
    const [place] = await t.run((ctx) => ctx.db.query("places").take(1));
    await t.withIdentity(REVIEWER).mutation(api.reviewMutations.decideItem, { item: { table: "places", id: place._id }, status: "rejected", reason: "wrong" });
    await t.run((ctx) => ctx.db.patch("stories", place.storyId, { title: "Festival preview" })); // title no longer names the cafe
    await t.mutation(internal.admin.refreshAllStorySearch, {});
    expect(await t.query(api.public.searchStoryCards, { text: "Corazón" })).toEqual([]);
  });
  it("filters by show and returns nothing for blank text", async () => {
    const t = makeTest();
    await published(t);
    expect(await t.query(api.public.searchStoryCards, { text: "festival", showSlug: "uniquely-milwaukee" })).toEqual([]);
    expect(await t.query(api.public.searchStoryCards, { text: "   " })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure** — `npx vitest run tests/storySearch.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`convex/schema.ts`, `stories`: `searchText: v.optional(v.string()), // published title + summary + topics + places (refreshStorySearch)` and
```ts
    .searchIndex("search_story", { searchField: "searchText", filterFields: ["reviewStatus", "doNotUse", "showSlug"] })
```
`convex/lib/storySearch.ts`:
```ts
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeForMatch } from "./evidence";

// A run holds at most 40 mentions and 3 topics (extraction schema).
const MAX_ROWS_PER_RUN = 200;

export function storySearchText(parts: { title: string; summary: string; topics: string[]; placeNames: string[] }): string {
  return normalizeForMatch([parts.title, parts.summary, ...parts.topics.map((t) => t.replace(/-/g, " ")), ...parts.placeNames].join(" "));
}

export function firstSentence(text: string, max = 140): string {
  const sentence = text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}

/** Recompute a story's search text from what is published right now; clears it when nothing is. */
export async function refreshStorySearch(ctx: MutationCtx, storyId: Id<"stories">): Promise<void> {
  const story = await ctx.db.get("stories", storyId);
  const runId = story?.approvedRunId;
  if (!story || !runId || story.reviewStatus !== "approved" || !story.summary) {
    if (story?.searchText) await ctx.db.patch("stories", storyId, { searchText: undefined });
    return;
  }
  const topics = await ctx.db.query("storyTopics").withIndex("by_storyId_and_runId", (q) => q.eq("storyId", storyId).eq("runId", runId)).take(MAX_ROWS_PER_RUN);
  const places = await ctx.db.query("places").withIndex("by_storyId_and_runId", (q) => q.eq("storyId", storyId).eq("runId", runId)).take(MAX_ROWS_PER_RUN);
  const searchText = storySearchText({
    title: story.title,
    summary: story.summary,
    topics: topics.filter((t) => t.reviewStatus === "approved").map((t) => t.topic),
    placeNames: places.filter((p) => p.reviewStatus === "approved").map((p) => p.officialName ?? p.name),
  });
  await ctx.db.patch("stories", storyId, { searchText });
}
```
(`normalizeForMatch` must strip accents and hyphens the way the first test expects; check its behavior in `convex/lib/evidence.ts` and adjust the test's expected string to its real output rather than changing `normalizeForMatch`.)

`convex/public.ts`:
```ts
export const searchStoryCards = query({
  args: { text: v.string(), showSlug: v.optional(v.string()) },
  handler: async (ctx, { text, showSlug }) => {
    const search = normalizeForMatch(text);
    if (!search) return [];
    const hits = await ctx.db
      .query("stories")
      .withSearchIndex("search_story", (q) => {
        const base = q.search("searchText", search).eq("reviewStatus", "approved").eq("doNotUse", false);
        return showSlug ? base.eq("showSlug", showSlug) : base;
      })
      .take(5);
    return hits.filter((s) => s.summary && s.approvedRunId).map((story) => {
      const show = getShowProfile(story.showSlug).name;
      return {
        storyId: story._id, title: story.title, show, showSlug: story.showSlug,
        attribution: attribution(show, story.publishedAt), publishedAt: story.publishedAt,
        hint: firstSentence(story.summary!), imageUrl: story.imageUrl ?? null,
      };
    });
  },
});
```
Call `await refreshStorySearch(ctx, storyId)` at the end of: `reviewMutations.approveEpisode`, `decideItem` (resolve `storyId` from the row before patching), `renameMention`, `savePin`, `setDoNotUse` (stories and mentions), and `admin.approveLatestRunForDemo`. Add to `convex/admin.ts`:
```ts
/** Backfill or repair: recompute search text for every story (≤ 1000). */
export const refreshAllStorySearch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stories = await ctx.db.query("stories").take(1000);
    for (const story of stories) await refreshStorySearch(ctx, story._id);
    return { refreshed: stories.length };
  },
});
```

- [ ] **Step 4: Run, expect pass; full suite; typecheck** — `npx vitest run && npm run typecheck`. Regenerate types with `npx convex codegen` (it needs `CLERK_JWT_ISSUER_DOMAIN`, which is set on the deployment).

- [ ] **Step 5: Commit** — `git add convex tests && git commit -m "feat: story-level search over published stories for Radio Commons"`.

---

### Task 3: Backstory ships (PR, deploy, backfills)

- [ ] **Step 1:** `git push -u origin feat/story-cards && gh pr create --title "Story images and story-level search for Radio Commons" --body "…(what, why, tests)…"`; wait for CI green.
- [ ] **Step 2 (PROD, ask Tarik):** merge the PR; `git checkout main && git pull --ff-only && npx convex dev --once`.
- [ ] **Step 3 (PROD):** backfill and check:
```bash
npx convex run ingest:ingestShow '{"showSlug":"this-bites","limit":1}'
npx convex run ingest:ingestShow '{"showSlug":"uniquely-milwaukee","limit":1}'
npx convex run admin:refreshAllStorySearch '{}'
npx convex run public:searchStoryCards '{"text":"art resale shop West Allis"}'
npx convex run public:searchStoryCards '{"text":"frugal dining"}'
```
Expected: both ingests log 1 document; `refreshed` = story count; the art-shop search returns the 414 Art Revival story **if it is published** (otherwise empty — publish it in the review UI first); "frugal dining" returns "Frugal dining and new restaurants in Milwaukee" with an `imageUrl` on `f.prxu.org`.

---

### Task 4: radio-commons scaffold, CI, station config, Backstory client

**Repo:** `~/Projects/radio-commons` (exists locally with `docs/` only).

**Files:**
- Create: Next.js app files, `vitest.config.ts`, `.github/workflows/ci.yml`, `src/lib/stations.ts`, `src/lib/backstory.ts`, `tests/backstory.test.ts`, `.env.example`, `README.md`

**Interfaces:**
- Produces:
  - `STATIONS: Record<string, Station>`; `type Station = { stationId: "radiomilwaukee"; name: string; shows: { slug: "this-bites" | "uniquely-milwaukee"; name: string }[] }`; `getStation(stationId?: string): Station`
  - `type StoryCardMatch = { storyId: string; title: string; show: string; showSlug: string; attribution: string; publishedAt: number; hint: string; imageUrl: string | null }`
  - `type Story` (zod-inferred from `getStory`'s return, plus `imageUrl`)
  - `interface BackstoryClient { searchStoryCards(text: string, showSlug?: string): Promise<StoryCardMatch[]>; getStory(storyId: string): Promise<Story | null> }`
  - `createBackstoryClient(opts: { query: (name: string, args: Record<string, unknown>) => Promise<unknown>; timeoutMs?: number }): BackstoryClient`
  - `class BackstoryUnavailable extends Error`
  - `backstoryFromEnv(): BackstoryClient` (uses `ConvexHttpClient(process.env.BACKSTORY_CONVEX_URL)`)

- [ ] **Step 1: Scaffold** (in a temp dir, then move in, so `docs/` is untouched):
```bash
cd /tmp && rm -rf rc-scaffold && npx create-next-app@latest rc-scaffold --ts --app --eslint --src-dir --import-alias "@/*" --use-npm --no-tailwind --yes
rsync -a --exclude .git /tmp/rc-scaffold/ ~/Projects/radio-commons/
cd ~/Projects/radio-commons && npm install mcp-handler@^2.2 @modelcontextprotocol/server@^2.2 @modelcontextprotocol/ext-apps@^2.0.3 @modelcontextprotocol/client@^2.2 convex zod@^4.2 && npm install -D vitest
```
Read `node_modules/next/dist/docs/` for route handlers in the installed Next version before writing `route.ts`. Add `"test": "vitest run", "typecheck": "tsc --noEmit"` to `package.json` scripts; `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ test: { environment: "node" }, resolve: { alias: { "@": path.resolve(__dirname, "src") } } });
```
`.env.example`:
```
# Backstory's Convex deployment (https://<name>.convex.cloud). Server-only.
BACKSTORY_CONVEX_URL=
```
`.github/workflows/ci.yml`: same shape as Backstory's (checkout, setup-node 20 with npm cache, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`), job name `check`.

- [ ] **Step 2: Failing tests** — `tests/backstory.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BackstoryUnavailable, createBackstoryClient } from "@/lib/backstory";
import { getStation } from "@/lib/stations";

const MATCH = { storyId: "s1", title: "Frugal dining", show: "This Bites", showSlug: "this-bites", attribution: "This Bites, September 2026", publishedAt: 1, hint: "Cheap eats.", imageUrl: null };

describe("stations", () => {
  it("has Radio Milwaukee with its two shows", () => {
    expect(getStation()).toMatchObject({ stationId: "radiomilwaukee", shows: [{ slug: "this-bites" }, { slug: "uniquely-milwaukee" }] });
  });
});

describe("Backstory client", () => {
  it("passes search text and show to searchStoryCards and validates the reply", async () => {
    const calls: unknown[] = [];
    const client = createBackstoryClient({ query: async (name, args) => { calls.push([name, args]); return [MATCH]; } });
    expect(await client.searchStoryCards("cheap eats", "this-bites")).toEqual([MATCH]);
    expect(calls).toEqual([["public:searchStoryCards", { text: "cheap eats", showSlug: "this-bites" }]]);
  });
  it("aborts a slow Backstory call", async () => {
    const client = createBackstoryClient({ query: () => new Promise((r) => setTimeout(() => r([]), 1000)), timeoutMs: 50 });
    await expect(client.searchStoryCards("x")).rejects.toBeInstanceOf(BackstoryUnavailable);
  });
  it("treats a malformed reply as unavailable, never as data", async () => {
    const client = createBackstoryClient({ query: async () => [{ nope: true }] });
    await expect(client.searchStoryCards("x")).rejects.toBeInstanceOf(BackstoryUnavailable);
  });
  it("returns null for an unknown or unpublished story", async () => {
    const client = createBackstoryClient({ query: async () => null });
    expect(await client.getStory("missing")).toBeNull();
  });
});
```

- [ ] **Step 3: Run, expect failure** — `npx vitest run tests/backstory.test.ts`.

- [ ] **Step 4: Implement**

`src/lib/stations.ts`:
```ts
export type ShowSlug = "this-bites" | "uniquely-milwaukee";
export interface Station { stationId: "radiomilwaukee"; name: string; shows: { slug: ShowSlug; name: string }[] }

export const STATIONS: Record<Station["stationId"], Station> = {
  radiomilwaukee: {
    stationId: "radiomilwaukee",
    name: "Radio Milwaukee",
    shows: [{ slug: "this-bites", name: "This Bites" }, { slug: "uniquely-milwaukee", name: "Uniquely Milwaukee" }],
  },
};

// ponytail: one station until the multi-station slice; callers already pass stationId through.
export function getStation(stationId: string = "radiomilwaukee"): Station {
  const station = STATIONS[stationId as Station["stationId"]];
  if (!station) throw new Error(`Unknown station: ${stationId}`);
  return station;
}
```
`src/lib/backstory.ts`:
```ts
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";

const matchSchema = z.object({
  storyId: z.string(), title: z.string(), show: z.string(), showSlug: z.string(), attribution: z.string(),
  publishedAt: z.number(), hint: z.string(), imageUrl: z.string().nullable(),
});
const storySchema = z.object({
  storyId: z.string(), show: z.string(), title: z.string(), summary: z.string(), publishedAt: z.number(),
  attribution: z.string(), audioUrl: z.string(), permalink: z.string().nullable(), imageUrl: z.string().nullable().default(null),
  mentions: z.array(z.object({ entityType: z.string(), name: z.string(), quote: z.string(), startMs: z.number(), relatedPlace: z.string().nullable() })),
  places: z.array(z.object({ name: z.string(), category: z.string(), lat: z.number().nullable(), lng: z.number().nullable(), neighborhood: z.string().nullable(), quote: z.string() })),
  topics: z.array(z.object({ topic: z.string(), confidence: z.number(), quote: z.string() })),
  actions: z.array(z.object({ kind: z.string(), label: z.string(), quote: z.string(), place: z.string().nullable() })),
});
export type StoryCardMatch = z.infer<typeof matchSchema>;
export type Story = z.infer<typeof storySchema>;

export class BackstoryUnavailable extends Error {}

export interface BackstoryClient {
  searchStoryCards(text: string, showSlug?: string): Promise<StoryCardMatch[]>;
  getStory(storyId: string): Promise<Story | null>;
}

type Query = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function createBackstoryClient({ query, timeoutMs = 350 }: { query: Query; timeoutMs?: number }): BackstoryClient {
  async function call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        query(name, args),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new BackstoryUnavailable(`${name} timed out after ${timeoutMs} ms`)), timeoutMs); }),
      ]);
      const parsed = schema.safeParse(result);
      if (!parsed.success) throw new BackstoryUnavailable(`${name} returned an unexpected shape`);
      return parsed.data;
    } catch (error) {
      throw error instanceof BackstoryUnavailable ? error : new BackstoryUnavailable(`${name} failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    searchStoryCards: (text, showSlug) => call("public:searchStoryCards", showSlug ? { text, showSlug } : { text }, z.array(matchSchema)),
    getStory: (storyId) => call("public:getStory", { storyId }, storySchema.nullable()),
  };
}

export function backstoryFromEnv(): BackstoryClient {
  const url = process.env.BACKSTORY_CONVEX_URL;
  if (!url) throw new Error("BACKSTORY_CONVEX_URL is not set");
  const convex = new ConvexHttpClient(url);
  return createBackstoryClient({ query: (name, args) => convex.query(makeFunctionReference<"query">(name), args) });
}
```
Note: `getStory` validates `storyId` as a Convex id; a non-id string makes Convex throw, which maps to `BackstoryUnavailable`. Task 5 maps an *invalid* id to "not found" before calling (`/^[a-z0-9]{1,64}$/`).

- [ ] **Step 5: Run, expect pass; typecheck; build** — `npm test && npm run typecheck && npm run build`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: scaffold Radio Commons with station config, Backstory client and CI"` (check `git status` first: no `.env*` files besides `.env.example`).

- [ ] **Step 7 (PROD, ask Tarik): GitHub repo + CI proof + protection.** Visibility per Tarik (spec open question 3; default **private**, shared with the Amazon reviewers listed in the rules at submission time). `gh repo create tmoody1973/radio-commons --private --source . --remote origin && git push -u origin main`; watch CI green; push a deliberately broken test → red; revert → green; then `gh api -X PUT repos/tmoody1973/radio-commons/branches/main/protection` with required check `check` (same body as Backstory's).

---

### Task 5: Spoken answers and the two tools on `/api/mcp`

**Files:**
- Create: `src/lib/speech.ts`, `src/lib/mcp.ts`, `src/app/api/mcp/route.ts`, `tests/speech.test.ts`, `tests/mcp-wire.ts`, `tests/mcp.test.ts`

**Interfaces:**
- Consumes: `BackstoryClient`, `StoryCardMatch`, `Story`, `BackstoryUnavailable` (Task 4); `getStation` (Task 4).
- Produces:
  - `monthYear(ms: number): string` ("September 2026", America/Chicago)
  - `directAudioUrl(url: string): string`
  - `spokenMatches(matches: StoryCardMatch[]): string`
  - `spokenStory(story: Story): string`
  - `const UNAVAILABLE_SPEECH: string`
  - `buildMcpHandler(deps: { backstory: () => BackstoryClient; cardHtml: () => string }): (request: Request) => Promise<Response>`
  - Tool names: `find_station_story`, `get_station_story`; card URI `ui://radio-commons/story-card.html`
  - `mcpPost(handler, body, id?)` test helper in `tests/mcp-wire.ts`

- [ ] **Step 1: Failing speech tests** — `tests/speech.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { directAudioUrl, monthYear, spokenMatches, spokenStory } from "@/lib/speech";
import type { Story } from "@/lib/backstory";

const STORY: Story = {
  storyId: "s1", show: "Uniquely Milwaukee", title: "Creativity is sustainable, accessible at 414 Art Revival",
  summary: "414 Art Revival is an art resale shop in West Allis.", publishedAt: Date.UTC(2026, 8, 18, 15),
  attribution: "Uniquely Milwaukee, September 2026", audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3",
  permalink: null, imageUrl: null, mentions: [], topics: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
  actions: [{ kind: "visit", label: "Visit 414 Art Revival", quote: "q", place: "414 Art Revival" }],
};

describe("speech", () => {
  it("labels months in Milwaukee time", () => {
    expect(monthYear(Date.UTC(2026, 9, 1, 3))).toBe("September 2026"); // 10 p.m. Sept 30 in Milwaukee
  });
  it("tells the story with its source and offers directions to its place", () => {
    expect(spokenStory(STORY)).toBe(
      "From Uniquely Milwaukee, September 2026: Radio Milwaukee's summary says, 414 Art Revival is an art resale shop in West Allis. Would you like directions to 414 Art Revival, or to hear the episode?",
    );
  });
  it("offers the episode when there is no place", () => {
    expect(spokenStory({ ...STORY, places: [] })).toMatch(/Would you like to hear the episode\?$/);
  });
  it("reads a shortlist, or admits there is no match", () => {
    expect(spokenMatches([])).toBe("I couldn't find a Radio Milwaukee story about that. Try a name, a place or a neighborhood.");
    expect(spokenMatches([{ storyId: "s1", title: "T1", show: "This Bites", showSlug: "this-bites", attribution: "This Bites, September 2026", publishedAt: 1, hint: "h", imageUrl: null }]))
      .toBe("I found one Radio Milwaukee story: T1, from This Bites, September 2026.");
  });
  it("skips the Podtrac tracking hop", () => {
    expect(directAudioUrl(STORY.audioUrl)).toBe("https://dovetail.prxu.org/13497/a.mp3");
  });
});
```

- [ ] **Step 2: Run, expect failure; implement `src/lib/speech.ts`:**
```ts
import type { Story, StoryCardMatch } from "@/lib/backstory";

export const UNAVAILABLE_SPEECH = "I can't reach Radio Milwaukee's stories right now. Please try again in a minute.";
const NO_MATCH = "I couldn't find a Radio Milwaukee story about that. Try a name, a place or a neighborhood.";
const PODTRAC = /^https?:\/\/dts\.podtrac\.com\/redirect\.mp3\//;

export function monthYear(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" }).format(ms);
}

export function directAudioUrl(url: string): string {
  return PODTRAC.test(url) ? url.replace(PODTRAC, "https://") : url;
}

const source = (m: { show: string; publishedAt: number }) => `${m.show}, ${monthYear(m.publishedAt)}`;

export function spokenMatches(matches: StoryCardMatch[]): string {
  if (matches.length === 0) return NO_MATCH;
  if (matches.length === 1) return `I found one Radio Milwaukee story: ${matches[0].title}, from ${source(matches[0])}.`;
  const list = matches.map((m, i) => `${i + 1}, ${m.title}, from ${source(m)}`).join("; ");
  return `I found ${matches.length} Radio Milwaukee stories: ${list}. Which one?`;
}

export function spokenStory(story: Story): string {
  const place = story.places.find((p) => p.lat !== null);
  const offer = place ? `Would you like directions to ${place.name}, or to hear the episode?` : "Would you like to hear the episode?";
  return `From ${source(story)}: Radio Milwaukee's summary says, ${story.summary} ${offer}`;
}
```
Run `npx vitest run tests/speech.test.ts` → PASS.

- [ ] **Step 3: Failing contract tests** — `tests/mcp-wire.ts` (Alexa+'s 2025-11-25 Streamable HTTP, sent straight to the handler):
```ts
type Handler = (request: Request) => Promise<Response>;

/** One JSON-RPC call the way a 2025-11-25 Streamable HTTP client (Alexa+) sends it. Reads JSON or a single SSE message. */
export async function mcpPost(handler: Handler, body: { method: string; params?: unknown }, id = 1) {
  const response = await handler(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id, ...body }),
  }));
  const text = await response.text();
  const json = text.startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "{}";
  return { status: response.status, message: JSON.parse(json) as { result?: any; error?: { message: string } } };
}

export const INITIALIZE = { method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "alexa-plus-test", version: "1" } } };
```
`tests/mcp.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BackstoryUnavailable, type BackstoryClient, type Story } from "@/lib/backstory";
import { buildMcpHandler } from "@/lib/mcp";
import { INITIALIZE, mcpPost } from "./mcp-wire";

const STORY = {
  storyId: "jn7ebag3ecbzcq29j3qm27k4p18fhn0v", show: "Uniquely Milwaukee", title: "414 Art Revival", summary: "An art resale shop.",
  publishedAt: Date.UTC(2026, 8, 18, 15), attribution: "Uniquely Milwaukee, September 2026",
  audioUrl: "https://dts.podtrac.com/redirect.mp3/dovetail.prxu.org/13497/a.mp3", permalink: null, imageUrl: "https://f.prxu.org/um.jpg",
  mentions: [], topics: [], actions: [], places: [{ name: "414 Art Revival", category: "venue", lat: 43.01, lng: -88.01, neighborhood: null, quote: "q" }],
} satisfies Story;

const fakeBackstory = (overrides: Partial<BackstoryClient> = {}): BackstoryClient => ({
  searchStoryCards: async () => [{ storyId: STORY.storyId, title: STORY.title, show: STORY.show, showSlug: "uniquely-milwaukee", attribution: STORY.attribution, publishedAt: STORY.publishedAt, hint: "An art resale shop.", imageUrl: STORY.imageUrl }],
  getStory: async (id) => (id === STORY.storyId ? STORY : null),
  ...overrides,
});
const handlerWith = (backstory = fakeBackstory()) => buildMcpHandler({ backstory: () => backstory, cardHtml: () => "<!doctype html><title>card</title>" });

describe("MCP endpoint (Alexa+ 2025-11-25 Streamable HTTP)", () => {
  it("initializes on protocol 2025-11-25 and lists both tools", async () => {
    const handler = handlerWith();
    const init = await mcpPost(handler, INITIALIZE);
    expect(init.message.result?.protocolVersion).toBe("2025-11-25");
    const tools = await mcpPost(handler, { method: "tools/list" }, 2);
    expect(tools.message.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["find_station_story", "get_station_story"]);
  });

  it("find_station_story returns matches and a spoken shortlist", async () => {
    const { message } = await mcpPost(handlerWith(), { method: "tools/call", params: { name: "find_station_story", arguments: { description: "art shop in West Allis" } } });
    expect(message.result.structuredContent.matches[0].storyId).toBe(STORY.storyId);
    expect(message.result.content[0].text).toMatch(/^I found one Radio Milwaukee story: 414 Art Revival/);
  });

  it("find returns an honest no-match", async () => {
    const { message } = await mcpPost(handlerWith(fakeBackstory({ searchStoryCards: async () => [] })), { method: "tools/call", params: { name: "find_station_story", arguments: { description: "moon base" } } });
    expect(message.result.structuredContent.matches).toEqual([]);
    expect(message.result.content[0].text).toMatch(/^I couldn't find/);
  });

  it("get_station_story speaks with its source and cleans the audio link", async () => {
    const { message } = await mcpPost(handlerWith(), { method: "tools/call", params: { name: "get_station_story", arguments: { storyId: STORY.storyId } } });
    expect(message.result.content[0].text).toMatch(/^From Uniquely Milwaukee, September 2026/);
    expect(message.result.structuredContent.story.audioUrl).toBe("https://dovetail.prxu.org/13497/a.mp3");
  });

  it("an unknown or malformed story id is 'not found', not an error", async () => {
    for (const storyId of ["jn7000000000000000000000000000000", "../etc"]) {
      const { message } = await mcpPost(handlerWith(), { method: "tools/call", params: { name: "get_station_story", arguments: { storyId } } });
      expect(message.result.content[0].text).toBe("I couldn't find that Radio Milwaukee story.");
    }
  });

  it("Backstory down: a plain apology, no partial data", async () => {
    const down = fakeBackstory({ searchStoryCards: async () => { throw new BackstoryUnavailable("down"); } });
    const { message } = await mcpPost(handlerWith(down), { method: "tools/call", params: { name: "find_station_story", arguments: { description: "anything" } } });
    expect(message.result.isError).toBe(true);
    expect(message.result.content[0].text).toBe("I can't reach Radio Milwaukee's stories right now. Please try again in a minute.");
    expect(message.result.structuredContent).toBeUndefined();
  });
});
```
Run → FAIL (`@/lib/mcp` missing).

- [ ] **Step 4: Implement `src/lib/mcp.ts` and the route**

Read `node_modules/mcp-handler/README.md`, `node_modules/@modelcontextprotocol/ext-apps/dist/src/server/index.d.ts` (`registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE`) first; adjust option names to the installed types if they differ from below.
```ts
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { BackstoryUnavailable, type BackstoryClient } from "@/lib/backstory";
import { directAudioUrl, spokenMatches, spokenStory, UNAVAILABLE_SPEECH } from "@/lib/speech";
import { getStation } from "@/lib/stations";

export const CARD_URI = "ui://radio-commons/story-card.html";
const NOT_FOUND = "I couldn't find that Radio Milwaukee story.";
const STORY_ID = /^[a-z0-9]{1,64}$/;
const CARD_CSP = { resourceDomains: ["https://f.prxu.org", "https://dovetail.prxu.org", "https://dovetail-cdn.prxu.org"] };

const text = (t: string) => [{ type: "text" as const, text: t }];

async function guarded<T>(tool: string, run: () => Promise<T>, fallback: () => T): Promise<T> {
  const started = Date.now();
  try {
    return await run();
  } catch (error) {
    console.error(JSON.stringify({ tool, ms: Date.now() - started, error: String(error) }));
    if (error instanceof BackstoryUnavailable) return fallback();
    throw error;
  } finally {
    console.log(JSON.stringify({ tool, ms: Date.now() - started }));
  }
}

export function buildMcpHandler(deps: { backstory: () => BackstoryClient; cardHtml: () => string }) {
  const showSlugs = getStation().shows.map((s) => s.slug) as [string, ...string[]];
  return createMcpHandler((server) => {
    server.registerTool(
      "find_station_story",
      {
        title: "Find a Radio Milwaukee story",
        description: "Find a Radio Milwaukee podcast story a listener remembers, by topic, person, place or neighborhood. Returns up to three published stories. Use only these results; never invent a story.",
        inputSchema: z.object({ description: z.string().min(1).max(200), show: z.enum(showSlugs).optional() }),
      },
      async ({ description, show }) =>
        guarded("find_station_story", async () => {
          const matches = (await deps.backstory().searchStoryCards(description, show)).slice(0, 3);
          return { content: text(spokenMatches(matches)), structuredContent: { stationId: getStation().stationId, matches } };
        }, () => ({ content: text(UNAVAILABLE_SPEECH), isError: true })),
    );

    registerAppTool(
      server,
      "get_station_story",
      {
        title: "Tell me about a Radio Milwaukee story",
        description: "Tell the listener about one Radio Milwaukee story. Speak only from this record, always say the show and month, and describe the summary as Radio Milwaukee's, not your own.",
        inputSchema: z.object({ storyId: z.string().min(1).max(64) }),
        _meta: { ui: { resourceUri: CARD_URI } },
      },
      async ({ storyId }) =>
        guarded("get_station_story", async () => {
          const story = STORY_ID.test(storyId) ? await deps.backstory().getStory(storyId) : null;
          if (!story) return { content: text(NOT_FOUND) };
          const clean = { ...story, audioUrl: directAudioUrl(story.audioUrl) };
          return { content: text(spokenStory(clean)), structuredContent: { stationId: getStation().stationId, story: clean } };
        }, () => ({ content: text(UNAVAILABLE_SPEECH), isError: true })),
    );

    registerAppResource(server, "Story card", CARD_URI, { description: "A Radio Milwaukee story with its source, places and episode." }, async () => ({
      contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: deps.cardHtml(), _meta: { ui: { csp: CARD_CSP } } }],
    }));
  }, { serverInfo: { name: "radio-commons", version: "0.1.0" } });
}
```
`src/app/api/mcp/route.ts`:
```ts
import { backstoryFromEnv } from "@/lib/backstory";
import { storyCardPage } from "@/lib/card";
import { buildMcpHandler } from "@/lib/mcp";

const handler = buildMcpHandler({ backstory: backstoryFromEnv, cardHtml: storyCardPage });
export { handler as GET, handler as POST, handler as DELETE };
```
(`storyCardPage` comes from Task 6; until then create `src/lib/card.ts` exporting `export const storyCardPage = () => "<!doctype html><title>Story</title>";` and replace it in Task 6.) Note: a Backstory error thrown by `getStory` for a well-formed but nonexistent id is mapped by Convex to a validator error → `BackstoryUnavailable`; if the "unknown id" test fails for that reason, catch it in the fake only — the live check is Task 7 Step 3.

- [ ] **Step 5: Run, expect pass; typecheck; build** — `npm test && npm run typecheck && npm run build`.

- [ ] **Step 6: Commit** — `git checkout -b feat/story-tools` (main is protected); `git add src tests && git commit -m "feat: find_station_story and get_station_story over Streamable HTTP"`.

---

### Task 6: The story card (MCP App)

**Files:**
- Modify: `src/lib/card.ts`, `next.config.ts`
- Test: `tests/card.test.ts`; extend `tests/mcp.test.ts`

**Interfaces:**
- Consumes: `Story` (Task 4), `monthYear` (Task 5), `CARD_URI` (Task 5).
- Produces: `renderCard(story: Story): string` (inner HTML, escaped); `storyCardPage(): string` (full HTML document with the MCP Apps `App` bundle inlined); `get_station_story` adds `cardHtml` to `structuredContent`.

- [ ] **Step 1: Failing tests** — `tests/card.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { renderCard, storyCardPage } from "@/lib/card";
import type { Story } from "@/lib/backstory";

const STORY: Story = {
  storyId: "s1", show: "Uniquely Milwaukee", title: "Art & <script>alert(1)</script> \"Revival\"", summary: "Shop <b>bold</b>.",
  publishedAt: Date.UTC(2026, 8, 18, 15), attribution: "Uniquely Milwaukee, September 2026", audioUrl: "https://dovetail.prxu.org/a.mp3",
  permalink: null, imageUrl: "https://f.prxu.org/um.jpg", mentions: [], topics: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43, lng: -88, neighborhood: "West Allis", quote: "q" }],
  actions: [{ kind: "visit", label: "Visit 414 Art Revival", quote: "q", place: "414 Art Revival" }],
};

describe("story card", () => {
  it("escapes story text in the card", () => {
    const html = renderCard(STORY);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Art &amp; &lt;script&gt;alert(1)&lt;/script&gt; &quot;Revival&quot;");
    expect(html).toContain("Shop &lt;b&gt;bold&lt;/b&gt;.");
  });
  it("shows image, source line, places, actions and a play button", () => {
    const html = renderCard(STORY);
    expect(html).toContain('src="https://f.prxu.org/um.jpg"');
    expect(html).toContain("Uniquely Milwaukee · September 2026");
    expect(html).toContain("414 Art Revival · West Allis");
    expect(html).toContain("Visit 414 Art Revival");
    expect(html).toContain('data-audio="https://dovetail.prxu.org/a.mp3"');
  });
  it("card hides empty sections and a missing image", () => {
    const html = renderCard({ ...STORY, imageUrl: null, places: [], actions: [] });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Places");
    expect(html).not.toContain("Things to do");
  });
  it("the page inlines the MCP Apps App bundle and renders structuredContent.cardHtml", () => {
    const page = storyCardPage();
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("ontoolresult");
    expect(page).toContain("cardHtml");
    expect(page.length).toBeGreaterThan(100_000); // the inlined app-with-deps bundle
  });
});
```
Append to `tests/mcp.test.ts`:
```ts
  it("lists the card resource with the MCP Apps mime type and links it from get_station_story", async () => {
    const handler = buildMcpHandler({ backstory: () => fakeBackstory(), cardHtml: () => "<!doctype html><title>card</title>" });
    const tools = await mcpPost(handler, { method: "tools/list" });
    const get = tools.message.result.tools.find((t: { name: string }) => t.name === "get_station_story");
    expect(get._meta.ui.resourceUri).toBe("ui://radio-commons/story-card.html");
    const read = await mcpPost(handler, { method: "resources/read", params: { uri: "ui://radio-commons/story-card.html" } }, 2);
    expect(read.message.result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    const called = await mcpPost(handler, { method: "tools/call", params: { name: "get_station_story", arguments: { storyId: STORY.storyId } } }, 3);
    expect(called.message.result.structuredContent.cardHtml).toContain("414 Art Revival");
  });
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `src/lib/card.ts`**
```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Story } from "@/lib/backstory";
import { monthYear } from "@/lib/speech";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderCard(story: Story): string {
  const places = story.places.length
    ? `<h3>Places</h3><ul>${story.places.map((p) => `<li>${escape(p.name)}${p.neighborhood ? ` · ${escape(p.neighborhood)}` : ""}</li>`).join("")}</ul>`
    : "";
  const actions = story.actions.length
    ? `<h3>Things to do</h3><ul class="chips">${story.actions.map((a) => `<li>${escape(a.label)}</li>`).join("")}</ul>`
    : "";
  const image = story.imageUrl ? `<img src="${escape(story.imageUrl)}" alt="${escape(story.show)} artwork" width="120" height="120">` : "";
  return `<article>${image}<div><p class="source">${escape(story.show)} · ${escape(monthYear(story.publishedAt))}</p><h2>${escape(story.title)}</h2>`
    + `<p>${escape(story.summary)}</p>${places}${actions}`
    + `<button type="button" class="play" data-audio="${escape(story.audioUrl)}">▶ Play episode</button></div></article>`;
}

let cached: string | null = null;

/** The MCP App page: inlines the official App bundle, then renders the server-made card HTML it receives. */
export function storyCardPage(): string {
  if (cached) return cached;
  const require = createRequire(import.meta.url);
  const bundle = readFileSync(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
  cached = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;font:16px/1.4 system-ui,sans-serif;background:#F7F1DB;color:#1E2124}
article{display:flex;gap:16px;padding:16px;border:3px solid #1E2124;background:#fff}
img{border:3px solid #1E2124;object-fit:cover}
.source{margin:0;color:#5C6369;font-size:14px}h2{margin:4px 0 8px;font-size:22px}h3{margin:12px 0 4px;font-size:15px}
ul{margin:0;padding-left:18px}.chips{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.chips li{border:2px solid #1E2124;padding:2px 8px}
.play{margin-top:12px;padding:8px 14px;border:3px solid #1E2124;background:#F7941D;font-weight:700;cursor:pointer}
</style></head><body><main id="root" aria-live="polite">Loading the story…</main>
<script type="module">
${bundle.replace(/<\/script/gi, "<\\/script")}
const root = document.getElementById("root");
const app = new App({ name: "radio-commons-story-card", version: "0.1.0" }, {});
app.ontoolresult = (result) => {
  const html = result?.structuredContent?.cardHtml;
  root.innerHTML = typeof html === "string" ? html : "Story unavailable.";
};
let audio = null;
root.addEventListener("click", (event) => {
  const button = event.target.closest("button.play");
  if (!button) return;
  audio = audio ?? new Audio(button.dataset.audio);
  if (audio.paused) { audio.play(); button.textContent = "❚❚ Pause"; } else { audio.pause(); button.textContent = "▶ Play episode"; }
});
await app.connect();
</script></body></html>`;
  return cached;
}
```
If the `App` export isn't in scope after inlining (the bundle ends with `export {…OO as App}`), rename the bundle's final `export {…}` into a local binding: replace the trailing `export{...,OO as App};` by matching `/export\s*\{([^}]*)\};?\s*$/` and emitting `const App = <localNameFor App>;` — verify against the installed bundle's last line before choosing. The test asserts the result renders.

In `src/lib/mcp.ts`, `get_station_story` success branch: `structuredContent: { stationId, story: clean, cardHtml: renderCard(clean) }` (import `renderCard`). In `next.config.ts` add `outputFileTracingIncludes: { "/api/mcp": ["./node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js"] }` so Vercel ships the bundle file.

- [ ] **Step 4: Run, expect pass; typecheck; build.**

- [ ] **Step 5: Commit** — `git add src tests next.config.ts && git commit -m "feat: story card MCP App with artwork, places, actions and episode playback"`.

---

### Task 7: Deploy, measure, onboard to Alexa+

- [ ] **Step 1 (PROD, ask Tarik): Vercel project.** `vercel link --yes` (new project `radio-commons`); `printf "%s" "$BACKSTORY_CONVEX_URL" | vercel env add BACKSTORY_CONVEX_URL production` and `preview` (value from Backstory's `.env.local` `CONVEX_URL`); set the function region next to Convex (check the Convex deployment region in its dashboard; set `"regions"` in `vercel.json` accordingly). Push the branch, open the PR, CI green, merge, `vercel deploy --prod --yes`. Expected URL: `https://radio-commons.vercel.app/api/mcp` (or the assigned alias).
- [ ] **Step 2: Wire check against production.** Run `tests/mcp-wire.ts` logic with `fetch` against the live URL (a small script `scripts/smoke.ts` using the same request shape): `initialize` (2025-11-25) → `tools/list` (2 tools) → `find_station_story` "frugal dining" → `get_station_story` with the returned id → `resources/read` the card. Expected: real story, `imageUrl` on f.prxu.org, cleaned audio URL.
- [ ] **Step 3: Latency.** 20 calls each of `find_station_story` and `get_station_story`, warm, then once after 15 minutes idle; record p50/p95 in `docs/LEARNING-LOG.md`. Expected: p95 ≤ 400 ms warm. If not: region first, then cache `getStory` for 60 s in memory.
- [ ] **Step 4 (Tarik + Claude): Alexa+ onboarding.** Install the Alexa AI CLI per https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html; Tarik runs `! alexa-ai configure` (browser sign-in). Then `alexa-ai new mcp --name "Radio Milwaukee Stories" --locale en-US --mcp-server-url "https://<prod>/api/mcp"`, review the generated `addon.json` (descriptions, example phrases: "What was that Uniquely Milwaukee story about the art shop in West Allis?", "Find the This Bites episode about frugal dining"), media assets (icons from Radio Milwaukee artwork the station owns), then `alexa-ai deploy`. Commit the add-on package files the CLI creates.
- [ ] **Step 5: Simulator test.** In the Alexa+ web simulator (developer console), ask both example phrases. Record: tools Alexa chose, what it said (does it keep the attribution and the "Radio Milwaukee's summary" framing?), whether the card renders, whether Play works. Screenshot each. If the card's audio doesn't play inline, note it as the answer to spec open question 2 and keep the button (it still works in hosts that allow media).

---

### Task 8: Docs, decision record, wrap-up

- [ ] **Step 1:** `README.md`: what Radio Commons is (2 sentences), architecture diagram from the spec, setup (`npm ci`, `.env.local` with `BACKSTORY_CONVEX_URL`), run (`npm run dev`, MCP URL `http://localhost:3000/api/mcp`), test (`npm test`), deploy (Vercel), Alexa onboarding (`alexa-ai` steps), and the trust rules (published-only, attribution, no invented stories). The rules require "clear setup and run instructions".
- [ ] **Step 2:** `docs/decisions/001-radio-commons-foundation.md` in the decision format (Decision / Why this came up / Options / What we chose and why — Tarik / What we gave up / How we'll know / What actually happened — blank): new repo + Vercel + `mcp-handler` + voice-and-card, from the spec's decision table.
- [ ] **Step 3:** `docs/LEARNING-LOG.md`: expected vs measured latency; simulator observations; anything Alexa+ did with the tool descriptions that surprised us.
- [ ] **Step 4:** PR, CI green, merge; comment the evidence on the Linear issue for this slice (create one in the Backstory project: "Radio Commons slice 1: story tools for Alexa+").
