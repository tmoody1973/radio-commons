# Radio Commons, slice 6: the weekly station briefing — design

**Date:** 2026-10-04 · **Status:** design approved in conversation; written spec awaiting review · **Owner:** Tarik Moody (decisions), Claude (draft)

## Purpose

"Alexa, what's new at Radio Milwaukee this week?" Alexa reads a short briefing from the station's weekly newsletter, in its normal voice, and every item opens into what Radio Commons already does: the real episode at the right moment, a premiere's Play song, this week's Concert Picks, or the page on radiomilwaukee.org. It is the front door that ties stories, music and events together in one ask.

**Not** an AI-voiced podcast: that overlaps Amazon's Alexa Podcasts and contradicts the pitch ("the station's real voices, not synthetic ones"). Decision recorded 2026-10-04.

**Success looks like (simulator):** "What's new at Radio Milwaukee this week?" → "This week at Radio Milwaukee, from the Oct. 1 newsletter: 1, … 2, … Which one?" with a numbered list card; "the second one" plays the Uniquely Milwaukee episode; "the Beet Street one" reads this week's Concert Picks.

## What Tarik decided (2026-10-04)

| Question | Decision |
| --- | --- |
| Podcast or briefing | Briefing from the newsletter, linked to the real content (option A) |
| Which newsletter | The 88Nine weekly: Mailchimp campaigns titled `Radio Milwaukee Newsletter - <date>` |
| Access | Mailchimp API key (account-wide; Mailchimp keys can't be scoped read-only), server-side only, set by Tarik |

## The source (measured 2026-10-04)

- Mailchimp account region `us7`; 2,745 sent campaigns. The weekly goes out Wednesdays/Thursdays to "Radio Milwaukee List", titled `Radio Milwaukee Newsletter - Oct. 1` etc. The same account sends member/VIP invites, giveaways, Liner Notes, The Green Room and Grace Weber's Music Lab: all ignored.
- The campaign's `plain_text` is regular: each item starts `** <Heading>` followed by a dashed rule, then the item's radiomilwaukee.org URL, one or two paragraphs in the station's voice, and a call to action `Label (url)`. Sponsor content sits between items: off-site image links, ad paragraphs (the Brewers venue ad), and lines like "… is sponsored by …" / "… are proud supporters of Radio Milwaukee."
- The Oct. 1 issue had 7 station items linking to `/concerts/` (Concert Picks), `/podcast/uniquely-milwaukee/` ×2, `/podcast/cinebuds/`, `/events-festivals/`, `/discover-music/artist-interviews/`.

## Design

### Reading the newsletter (Radio Commons, server-side)

- `fetchLatestNewsletter()`: Mailchimp `GET /3.0/campaigns?status=sent&sort_field=send_time&sort_dir=DESC&count=20&fields=…` (titles, ids, send times only), pick the newest whose `settings.title` starts `Radio Milwaukee Newsletter`, then `GET /3.0/campaigns/{id}/content?fields=plain_text`. Never requests lists, members or reports. Cached 1 hour in memory; 2 s timeout → `NewsletterUnavailable`.
- An issue older than 14 days is treated as none ("I don't have a recent newsletter").

### Parsing items (pure function, no AI)

`parseNewsletter(plainText) → { date, items: [{ heading, url, summary }] }`:
- Split on `** ` headings; for each item: `url` = the first `https://radiomilwaukee.org/…` URL in it; `summary` = its first paragraph's first sentence (the station's words, trimmed to ~200 characters).
- Dropped: items with no radiomilwaukee.org URL; paragraphs whose links are all off-site; sentences matching "sponsored by" / "proud supporters" / "Learn more"; merch and ad image links.
- Up to 6 items kept, in newsletter order.

### Linking each item (by its URL path)

| Path | Kind | Action |
| --- | --- | --- |
| `/concerts/…` | picks | "Want this week's picks?" → `station_picks` |
| a Backstory story's own page (premieres, sessions, Ladies First store radiomilwaukee.org permalinks) | story | exact permalink match → `get_station_story` (premiere: Play song) |
| `/podcast/<show>/<YYYY-MM-DD>/<slug>` for a show in Backstory (uniquely-milwaukee, this-bites) | story | Backstory `storyForPage(url)`: same show, published within 2 days of the date, title sharing a distinctive slug word → `get_station_story` |
| anything else (`/events-festivals/`, `/discover-music/artist-interviews/`, `/podcast/cinebuds/`) | page | "Read it on radiomilwaukee.org" (`openLink`) |

Backstory gains one public query, `storyForPage(url)`: published stories only, returns `{ storyId, title } | null`.

### The tool

`station_briefing()` (7th tool; no arguments): "What's new at Radio Milwaukee this week, from the station's newsletter."
- **Speech:** "This week at Radio Milwaukee, from the Oct. 1 newsletter: 1, <heading>: <summary>; 2, …" — up to 4 items, numbered like the screen, then "Which one?" Headings are spoken as written; summaries are the station's own sentences, credited to the newsletter.
- **Card:** Amazon List pattern — numbered rows (number badge, heading, one-line summary, one action: ▶ Play / Play song / Picks / Read). Light and dark, same tokens and scale as the other cards. Tapping a story row asks "Tell me about the story …" (existing flow); Picks asks "What is Radio Milwaukee recommending?"; Read opens the page.
- **Alexa's rules:** "What's new / what's happening at Radio Milwaukee this week" → `station_briefing`; to go deeper on an item, use the linked story or picks tool, never retell the newsletter beyond its sentences.

## Trust rules

Only the station's published newsletter text; never sponsor copy; never subscriber data; never invent items or details; every item credited to the newsletter and its date; linked stories still require editor approval (an unpublished story falls back to Read).

## Errors

| Situation | Listener hears |
| --- | --- |
| Mailchimp down / slow | "I can't reach Radio Milwaukee's newsletter right now." |
| No issue in 14 days | "I don't have a recent Radio Milwaukee newsletter." |
| An item's story isn't published | That row offers Read instead of Play |

## Testing

- Parser on the real Oct. 1 issue (fixture): 7 station items in order, Brewers ad and sponsor lines gone, each URL and first sentence right; an issue with an item lacking a station URL drops it.
- Newsletter client: picks the newest weekly among other campaign types, ignores older-than-14-days, requests only campaign fields (asserted on the URL), timeout → `NewsletterUnavailable`.
- Linking: `/concerts/` → picks; Glitzy premiere URL → exact match; `/podcast/uniquely-milwaukee/2026-10-01/my-way-out-milwaukee` → the My Way Out story via `storyForPage`; Cinebuds → Read; unpublished → Read.
- Backstory `storyForPage`: exact permalink, show+date+slug match, unpublished never returned.
- Tool: speech lines, card rows and actions, escaping, errors.
- Live: the simulator conversation above, light/dark screenshots.

## Out of scope

AI-generated audio of any kind; ingesting Cinebuds or artist interviews into Backstory (a later show profile); other newsletters; sending or editing anything in Mailchimp.

## Open questions

- Should the briefing say the newsletter's playful headings ("Un-beet-able") or a plainer topic? Default: the heading, then the station's first sentence, which names the subject.
