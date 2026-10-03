# 004: Design the cards to Amazon's MCP Design Guide for Alexa+

**Decision:** The card Alexa+ shows on screens follows Amazon's published design guide (its sizes, colors, four layout patterns and light/dark rules), with Radio Milwaukee's orange only on the main button, instead of the Field Guide's own look.

**Why this came up:** Tarik looked at the simulator and said the card looked bad. It did: it had been designed from a one-line note ("a source-provenance card") while Amazon publishes a full design guide for exactly this, which hadn't been read. The card was dense (summary paragraph, six place chips, three "things to do"), sized like a web page, light-only, with buttons a third of Amazon's minimum touch size. Judges look at the screen first.

**Options:**
1. **Follow Amazon's guide (chosen).** One title, one or two supporting lines, one main action; 768×480 base scaled 1.667× on an Echo Show; light and dark; only the List, Carousel, Card and Map patterns. Cost: the station's brand shows only in the logo and one button color.
2. **Keep the Field Guide's brand look, enlarged.** Recognizable, but reads as "a website inside Alexa", which the guide calls out directly.
3. **Return data only and let Alexa+ draw its own native cards.** Least work and most native, but we can't see or demo Alexa+'s native rendering without Amazon's developer access, and we'd lose play-from-a-moment and the map.

**What we chose and why:** Option 1 (Tarik approved the mockups; Claude proposed it). It is what a real Alexa+ device expects, it reads from across a room, and it keeps the two things native cards can't do: playing from the quoted moment and a numbered places map.

**What we gave up:**
- The Field Guide's bold brutalist look inside the device.
- The summary on screen (Alexa speaks it instead).
- Exact fidelity: Amazon's Local Inspector, which renders cards in real device frames, isn't available to hackathon participants, so the simulator follows the written rules, not Amazon's own preview.
- The fullscreen map's downtown pins still overlap at the starting zoom (zoom in to separate them).
- **Unverified on a real device:** the pan-and-zoom map loads a map library that starts background workers, which the MCP Apps security settings may not allow on a real Alexa+ screen. The simulator applies no such restriction, so it can't show this. The inline map (a plain picture) doesn't have this risk.

**How we'll know if this was right:** Every view reads at arm's length on a laptop screen at Echo Show size; a judge can tell what to tap without being told; nothing in the guide's accessibility checklist (contrast, 48 px targets, alt text) fails.

**What actually happened:**
