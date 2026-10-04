# Radio Commons slice 6: weekly station briefing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "What's new at Radio Milwaukee this week?" — Alexa reads a short briefing from the newest 88Nine weekly newsletter (Mailchimp) and each item opens the real story, premiere, Concert Picks or page.

**Architecture:** Radio Commons gains a server-side Mailchimp client (campaign titles and content only), a pure no-AI newsletter parser, an item linker (URL path → story / picks / page; stories resolved by Backstory's new `storyForPage` query) and a 14th tool `station_briefing` with a numbered-list card. No audio generation.

**Tech Stack:** Next.js + mcp-handler + ext-apps cards + zod + Vitest (radio-commons); Convex + convex-test (backstory). Mailchimp Marketing API v3 (`https://<dc>.api.mailchimp.com/3.0`, basic auth `anystring:<key>`).

**Spec:** `docs/superpowers/specs/2026-10-04-station-briefing-design.md` (approved 2026-10-04).

## Global Constraints

- Source: newest sent campaign whose `settings.title` starts `Radio Milwaukee Newsletter`; older than 14 days → none. Never request lists, members or reports; `fields=` restricts every Mailchimp call.
- `MAILCHIMP_API_KEY` server-side only (region = the part after the last `-`); never logged or returned.
- Items: up to 6 parsed, up to 4 spoken; sponsor content dropped (items/paragraphs with no `https://radiomilwaukee.org/` link; sentences with "sponsored by", "proud supporters").
- Speech credits the newsletter and its date; summaries are the station's own first sentence (≤200 chars); never invent or retell beyond it.
- Card: Amazon List pattern in the existing card tokens; light and dark; every text escaped.
- Errors: Mailchimp down/slow (2 s) → "I can't reach Radio Milwaukee's newsletter right now."; none recent → "I don't have a recent Radio Milwaukee newsletter."
- PROD: Radio Commons deploy and Backstory deploy need Tarik's go-ahead; `MAILCHIMP_API_KEY` in Vercel production is Tarik's step.

## Review Focus

1. **A newsletter issue with an item heading but its station link only in the call to action** (no bare URL under the rule). Expected: the CTA URL is used. Test: Task 1 "CTA-only link".
2. **A podcast page whose story isn't published in Backstory** (or was published under a different title). Expected: the row offers Read, not Play; never a wrong story. Test: Task 2 "unpublished → null" and Task 3 "no match → page".
3. **Two Backstory episodes of the same show within two days** (UM publishes several a week). Expected: the slug words decide; no match if none shares a distinctive word. Test: Task 2.
4. **Heading text with emoji or HTML entities** ("Tis the (post)season", "&amp;"). Expected: spoken plain, card escaped. Test: Task 1 + Task 4 escaping.
5. **Mailchimp returns the newsletter but the newest weekly is a test/draft-titled campaign** (e.g. "Radio Milwaukee Newsletter - Oct. 8 (copy)"). Expected: only `status=sent` campaigns are read, so drafts never appear; a "(copy)" title that was actually sent is accepted as written. Test: Task 1 client "only sent".

---

### Task 1: Newsletter client and parser (radio-commons)

**Files:** Create `src/lib/newsletter.ts`; fixture `tests/fixtures/newsletter-2026-10-01.txt` (the real Oct. 1 `plain_text`); Test `tests/newsletter.test.ts`; modify `.env.example` (`MAILCHIMP_API_KEY=`).

**Produces:**
```ts
export interface NewsletterItem { heading: string; url: string; summary: string }
export interface Newsletter { title: string; sentAt: string; date: string; items: NewsletterItem[] }  // date: "Oct. 1"
export class NewsletterUnavailable extends Error {}
export function parseNewsletter(plainText: string): NewsletterItem[]
export function createNewsletterClient(opts: { apiKey: string; fetch?: typeof fetch; now?: () => Date; timeoutMs?: number }): { latest(): Promise<Newsletter | null> }
export function newsletterFromEnv(): { latest(): Promise<Newsletter | null> }   // throws NewsletterUnavailable when the key is missing
```

- [ ] Failing tests:
```ts
import { readFileSync } from "node:fs";
const OCT1 = readFileSync("tests/fixtures/newsletter-2026-10-01.txt", "utf8");
it("reads the Oct. 1 issue: station items in order, sponsor content gone", () => {
  const items = parseNewsletter(OCT1);
  expect(items[0]).toEqual({ heading: "Playtime’s over", url: "https://radiomilwaukee.org/discover-music/artist-interviews/2026-10-01/brewers-playoffs-2026-chances-schedule", summary: expect.stringMatching(/^Jeff Levering is everything you want in an announcer\./) });
  expect(items.map((i) => i.heading)).toEqual(expect.arrayContaining(["Un-beet-able", "Move your feet", "A new perspective", "A way forward", "Art and soul"]));
  expect(JSON.stringify(items)).not.toMatch(/American Family Field|proud supporters|sponsored by|mlb\.com|milwaukeemerch/);
  expect(items.length).toBeLessThanOrEqual(6);
});
it("an item with no radiomilwaukee.org link is dropped; a CTA-only link is used", () => {
  const text = "** Ad\n----\nhttps://example.com\nBuy things.\n\n** Real\n----\nGreat show this week. More words.\nCheck it out (https://radiomilwaukee.org/concerts/x)";
  expect(parseNewsletter(text)).toEqual([{ heading: "Real", url: "https://radiomilwaukee.org/concerts/x", summary: "Great show this week." }]);
});
it("client: newest sent weekly only, fields restricted, 14-day limit, timeout", async () => {
  // fake fetch serving: campaigns [VIP send (newest), Liner Notes, "Radio Milwaukee Newsletter - Oct. 1"], and that campaign's content = OCT1
  // assertions: see the list below
});
```
  The client test asserts: the first request URL contains `status=sent`, `sort_field=send_time`, `fields=` and no `/lists` or `/members`; the weekly is chosen over a newer "Studio Milwaukee Session - … VIP Send"; `sentAt` 15 days before `now` → `null`; a fetch that never resolves → `NewsletterUnavailable` after `timeoutMs`; HTTP 401 → `NewsletterUnavailable`; `Authorization: Basic base64("x:<key>")` and host `us7.api.mailchimp.com` for a key ending `-us7`.
- [ ] Run → FAIL (module missing).
- [ ] Implement: `parseNewsletter` splits on `/^\*\* /m`; per section drop the dashed rule; collect paragraphs (blank-line separated); `url` = first match of `/https:\/\/radiomilwaukee\.org\/[^\s)]+/` in the section; drop the section when none; `summary` = the first paragraph that isn't a bare URL, isn't a CTA line (`/\(https?:\/\//`), and has no sponsor phrase — its first sentence (`/^.*?[.!?](\s|$)/`), trimmed to 200 chars at a word boundary; `heading` trimmed. Client: two `fetch` calls with `AbortSignal.timeout`, zod-validated, cached per instance for 1 hour.
- [ ] PASS; suite; typecheck; commit (branch `feat/station-briefing`).

### Task 2: Backstory `storyForPage(url)` (backstory)

**Files:** Modify `convex/public.ts`; Test `tests/storyForPage.test.ts`.

**Produces:** public query `storyForPage({ url: string }) → { storyId: string; title: string } | null` (published, not do-not-use, approved run only).

- [ ] Failing convex-tests: a published premiere whose `permalink` equals the URL → it; `https://radiomilwaukee.org/podcast/uniquely-milwaukee/2026-10-01/my-way-out-milwaukee` → the UM story published 2026-10-01 titled "Through tech and teaching, My Way Out provides a path forward" (slug `my-way-out-milwaukee` → words `way`, `out`: ≥3 characters, not stop words; the title contains both); a second UM story on 2026-09-30 titled "Creativity is sustainable, accessible at 414 Art Revival" is NOT returned for that URL; the same URL with the story unpublished → null; a `/podcast/cinebuds/…` URL → null (no such show); a non-radiomilwaukee URL → null; a URL > 500 chars → null.
- [ ] Implement: parse with `new URL`; host must be `radiomilwaukee.org`; exact match via a scan of approved stories' `permalink` (≤500 newest approved, same `by_reviewStatus_and_publishedAt` index the published list uses); else `/podcast/<show>/<YYYY-MM-DD>/<slug>` where `<show>` is a known profile slug: stories of that show with `publishedAt` within ±2 days whose normalized title contains every slug word of ≥3 characters outside `{the,and,for,with,milwaukee,mke}` (at least one word required). Return the closest by date.
- [ ] PASS; suite; typecheck; commit; PR; CI. **PROD:** merge + `npx convex dev --once` (go-ahead).

### Task 3: Linking items (radio-commons)

**Files:** Create `src/lib/briefing.ts`; modify `src/lib/backstory.ts` (`storyForPage` on the client); Test `tests/briefing.test.ts`.

**Produces:**
```ts
export type BriefingAction = { kind: "story"; storyId: string; title: string } | { kind: "picks" } | { kind: "page"; url: string };
export interface BriefingItem extends NewsletterItem { action: BriefingAction }
export async function linkItems(items: NewsletterItem[], backstory: Pick<BackstoryClient, "storyForPage">): Promise<BriefingItem[]>
```
- [ ] Failing tests: `/concerts/…` → `{kind:"picks"}` without calling Backstory; a story URL with a fake `storyForPage` hit → `{kind:"story", storyId, title}`; miss → `{kind:"page", url}`; `storyForPage` throwing → page (never fails the briefing); lookups run in parallel (fake resolves out of order, result keeps newsletter order).
- [ ] Implement; PASS; commit.

### Task 4: The tool, speech and card (radio-commons)

**Files:** Modify `src/lib/mcp.ts` (deps `newsletter: () => NewsletterClient`; register `station_briefing`), `src/app/api/mcp/route.ts` (pass `newsletterFromEnv`), `src/lib/speech.ts` (`spokenBriefing`, `NEWSLETTER_UNAVAILABLE_SPEECH`, `NO_NEWSLETTER_SPEECH`), `src/lib/card/views.ts` (`{ view: "briefing"; date: string; items: BriefingItem[] }`), `src/lib/card/page.ts` (CSS), `src/lib/sim/brain.ts` (rule), `tests/fixtures.ts` (`fakeNewsletter`); Tests `tests/briefing.test.ts`, `tests/mcp.test.ts`, `tests/sim/brain.test.ts`.

- [ ] Failing tests:
  - `spokenBriefing({date:"Oct. 1", items})` = `"This week at Radio Milwaukee, from the Oct. 1 newsletter: 1, Un-beet-able: <summary>; 2, …. Which one?"` — at most 4 items, numbered like the screen.
  - Card: one row per item (≤6) with number badge, heading, summary; action button by kind — story: `class="primary ask" data-ask="Tell me about the story &quot;<title>&quot;"` labelled Play; picks: `data-ask="What is Radio Milwaukee recommending?"` labelled Picks; page: `class="secondary details" data-url=<url>` labelled Read; all text escaped (a heading `<b>&</b>` renders as text).
  - Tool: `station_briefing` listed (14 tools); with `fakeNewsletter` returns speech + card; `null` → `NO_NEWSLETTER_SPEECH`, no card; `NewsletterUnavailable` → `NEWSLETTER_UNAVAILABLE_SPEECH` with `isError`.
  - Brain prompt names `station_briefing` for "what's new at Radio Milwaukee this week" and says to go deeper with the linked story or picks, never retelling beyond the newsletter's sentences.
- [ ] Implement; PASS; build; commit; PR; CI. **PROD:** merge + `vercel deploy --prod` (go-ahead; requires `MAILCHIMP_API_KEY` in Vercel production).

### Task 5: Live checks, docs, review

- [ ] Simulator: "What's new at Radio Milwaukee this week?" (list card, speech names the date); "the fifth one" / tapping a story row plays the UM episode; tapping the Beet Street row reads Concert Picks; a Read row opens radiomilwaukee.org. Screenshots light/dark.
- [ ] README tools list (14: add `station_briefing` under a new "Briefing" group) and status table; decision 007 (briefing from the newsletter, not an AI podcast; Mailchimp key scope); learning log entry.
- [ ] Final fresh review; fix Critical/Important test-first.
