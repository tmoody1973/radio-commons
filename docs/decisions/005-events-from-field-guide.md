# 005: Events come from the Field Guide through a small read-only API, and venues got map pins

**Decision:** Alexa answers event questions from the MKE Field Guide through two new read-only endpoints (`/api/public/events`, `/api/public/picks`), and the Field Guide's venues were given map pins (154 of them) so "near there" works.

**Why this came up:** The concept's demo moment is "What's happening near there tonight?" right after a story. The Field Guide already gathers 24 event sources, but no other app could read it, and only 35% of this week's events had a venue on the map, so "near there" would mostly find nothing.

**Options:**
1. **A read-only API in the Field Guide (chosen).** Reuses its search, "tonight" handling, calendar links and venue registry; the database stays private. Cost: a second app to deploy for this feature.
2. **Radio Commons reads the Field Guide database directly.** Fewer moving parts, but duplicates the search logic and shares database access across apps.
3. **Copy events into Backstory.** Everything Alexa reads in one place, but events go stale between copies.

**What we chose and why:** Option 1 (Tarik's call). One source of truth; Radio Commons sees only what the public site shows. For pins (also Tarik's call): Amazon Location looked up 155 venues with a single real street address (~$1.25); 154 matched with a name or street check, one (Hartford, 30+ miles out) was skipped. Never geocoded: 18 "Ask A Punk" DIY venues whose addresses are deliberately private, 19 multi-location series, 17 entries with no street address.

**What we gave up:**
- New venues added later have no automatic pin yet (the Field Guide has no AWS credentials); a follow-up.
- "Near" only knows venues with a single address; park series and private venues never show on a map.
- Some events appear twice where the Field Guide has duplicate listings at two venue spellings.
- Events near outlying places (Ted's Ice Cream in Wauwatosa) are often honestly empty.

**How we'll know if this was right:** "What's on near [a downtown story place] tonight?" returns nearby events with distances on most evenings; coverage of this week's event venues stays above 90% (it went from 41 of 64 to 62 of 64).

**What actually happened:**
