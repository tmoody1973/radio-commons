# 007 — The weekly station briefing reads the newsletter; it doesn't make a podcast

**Decision** — "What's new at Radio Milwaukee this week?" is answered from the newest 88Nine weekly newsletter in Mailchimp (the email service the station sends it with): up to four items, each in the newsletter's own first sentence, each opening the real story, this week's Concert Picks or the page on radiomilwaukee.org. No AI writes or voices anything.

**Why this came up** — The first idea was an AI-generated podcast of the newsletter. It would demo well, but it would put words in the station's mouth, take minutes to make, and add an audio pipeline three weeks before the deadline. What was at stake: a feature judges remember for the wrong reason, or a listener hearing something the station never said.

**Options**
- *AI podcast from the newsletter* — impressive and new; but generated speech and summaries need review, the audio has to be made and stored each week, and a mistake is in the station's voice.
- *Read the newsletter as a short briefing, linked to the real content* (chosen) — the newsletter is already edited and sent by staff, so every sentence was approved; links lead into stories Alexa can already play. Costs a Mailchimp key on the server and a parser that depends on the newsletter's layout.
- *Skip it* — no new risk, but "what's happening at the station" stays unanswered.

**What we chose and why** — The second (Tarik chose the briefing, 2026-10-04; Claude recommended it). It shows the point of Radio Commons, the station's own work reaching Alexa, without generated content. A newsletter link becomes a playable story when Backstory finds the published story behind that page (`storyForPage`); when it isn't sure, the item is a Read link instead of a guess.

**What we gave up** — The Mailchimp key can't be limited to reading; it can do anything in the account, so it lives only on the server and the code asks only for campaign titles and content, never subscribers. The parser expects the newsletter's current layout (headings marked `**`, one radiomilwaukee.org link per item); a redesign would need a code change. Items without a station link (sponsors, partners) are dropped on purpose. Only "first sentence" summaries: long first sentences are cut at 200 characters. Alexa reads up to four items, about 30 seconds.

**How we'll know if this was right** — Each Wednesday's newsletter becomes a briefing with no one touching it; at least half the items open a story or Concert Picks rather than a Read link; and the demo's "What's new this week?" → "the fifth one" plays a real episode.

**What actually happened** —
