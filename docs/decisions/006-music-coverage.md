# 006 — Music coverage: premieres and sessions as stories, Concert Picks as staff picks, premiere songs play

**Decision** — Radio Milwaukee's music journalism reaches Alexa three ways: Milwaukee Music Premieres and Studio Milwaukee Sessions become editor-reviewed Backstory stories built from their articles, each with a "song record" (artist, song, album, release date, credits, release show, or a session's set list); the weekly MKE Concert Picks become MKE Field Guide staff picks matched to events; and Alexa plays a premiere's song.

**Why this came up** — Music is the third pillar of Radio Commons, and the station's own music coverage is what a streaming service can't offer: facts about Milwaukee artists that the big catalogs (MusicBrainz, Discogs, Spotify) barely have. The risks were real: premiere articles quote lyrics, the song audio is flagged "not downloadable" in CDS (the NPR content system the station publishes to), and Concert Picks have no collection of their own — just a title and a list.

**Options**
- *Everything into Backstory as stories* — one pipeline, editor review for all; but Concert Picks wouldn't be linked to individual events, so Alexa couldn't offer Add to calendar.
- *Concert Picks into the Field Guide, premieres and sessions into Backstory* (chosen) — each lands where its data already lives: picks next to the events they point to, songs next to stories. Costs a second import path and a dry-run step on the live event database.
- *Wait for the playlist enrichment tool and do music all at once* — one coherent music feature, but nothing music-related for the demo until the tool exists.

**What we chose and why** — The second (Tarik, 2026-10-04). Concert Picks immediately improve "What's Radio Milwaukee recommending?" (12 real picks the first week), and premieres give the demo its music moment: "Play the new Glitzy song." Premiere songs play because the artist submitted them for on-demand listening and the station already streams them on its site (Tarik's call, despite the CDS flag); a single setting turns playback off. Sessions stay text-only (decision 012 in Backstory).

**What we gave up** — "What's playing on 88Nine?" still waits for the playlist tool. Lyrics are stripped only when CDS marks them the usual way (italic lines with line breaks); other formats rely on the AI's instructions. Two of 30 premieres came through without a song record. Concert Picks lines the event guide doesn't have (8 of 20 the first week) are listed for staff, not shown to listeners.

**How we'll know if this was right** — Each week's Concert Picks import without anyone touching it (the daily job), most premieres pass review with their song record unchanged, and the demo's "Play the new Glitzy song" works first time on the device.

**What actually happened** —
