# 011: Newsletter articles open inside ChatGPT, read from NPR's copy

**Decision:** In the ChatGPT app, tapping Read on a newsletter item opens the radiomilwaukee.org article as a card in the chat. The text comes from NPR's content service (CDS, the database where NPR stores every station article as clean, structured text), not from the web page itself.

**Why this came up:** The newsletter card had a Read button that sent listeners out of ChatGPT to the station's site. Tarik asked for the article to show "in a nice way" inside the chat, with the site link as a second option. Getting the text wrong would mean garbled articles (menus, share buttons, run-together lines), and a source that breaks every time the site changes would quietly turn Read back into a dead end.

**Options:**
1. **Read NPR's copy (CDS).** radiomilwaukee.org runs on NPR's Grove system, which publishes every article to CDS, and each page names its own CDS id (`nprStoryId`). Cost: two lookups per article (about 1 to 2 seconds), and an NPR access key in our settings.
2. **Scrape the web page.** No key needed. Cost: the page is 158 KB of navigation, scripts and markup around the article; extraction breaks whenever the site's design changes, and line breaks inside event listings get lost.
3. **Leave Read as a link.** Free. Cost: the listener leaves ChatGPT, and ChatGPT can't answer questions about the article.

**What we chose and why:** Option 1 (joint: Tarik chose reading in chat; Claude proposed NPR's copy over scraping). CDS keeps headings, line breaks and the photo's caption and credit as separate fields, so the card can show "Milwaukee Oktoberfest / Henry Maier Festival Park / Oct. 2-4" on three lines instead of one run-together string. Backstory already reads articles from CDS the same way, so the approach is proven here.

**What we gave up:**
- A second secret to manage (`NPR_CDS_TOKEN` in Radio Commons, the same key Backstory uses).
- Pages that aren't articles (show pages, forms) still open as links.
- Links inside the article (each event's own site) become plain text in the card; "Open on radiomilwaukee.org" is the way to them.
- Read opens the article as a new card below the newsletter, which costs a ChatGPT turn (a few seconds) instead of swapping the card in place. We chose this so the newsletter list stays visible and ChatGPT can read the article to answer follow-ups.

**How we'll know if this was right:** For a month of newsletters, every "Read" item that is a radiomilwaukee.org article opens as a card with its full text and headings intact, and the server logs show no `read_article` failures beyond the occasional NPR outage.

**What actually happened:**
