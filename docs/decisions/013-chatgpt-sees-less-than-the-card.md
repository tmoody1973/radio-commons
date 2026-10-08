# 013: In ChatGPT, the model sees titles; the card keeps the pictures

**Decision:** When a Radio Milwaukee tool answers with a card, ChatGPT's model now gets only the facts it needs to talk about the answer (titles, ids, dates, the story link). Pictures, calendar links, audio links and map points go to the card alone. Each card answer also tells the model, in the answer itself, that the card above already shows it.

**Why this came up:** On October 8 Tarik shared a chat that felt "duplicated and janky." Every answer appeared twice: our card, then ChatGPT's own redrawn version of the same list underneath. The redrawn copy showed gray boxes where pictures should be, because ChatGPT only displays images it found itself, never ones from our servers (in that chat, 0 of the 49 addresses ChatGPT trusted were our podcast image host). We already asked the model in three places not to repeat the card. It did anyway. If we got this wrong, the app looks broken in front of every beta tester, on every single answer.

**Options:**
1. **Hide the display fields from the model, and say "the card shows this" in each answer.** Cost: the model can't describe a picture or hand over a calendar link itself; it has to point at the card.
2. **Hide everything except a count and ids.** The model could never redraw anything. Cost: it couldn't answer "which one is at the Cooperage?" without another tool call, and replies get vague.
3. **Keep asking politely, with stronger wording in the tool descriptions.** Nothing to build. Cost: we had already tried this three ways and it didn't work.

**What we chose and why:** Option 1 (Claude proposed it, Tarik approved it). The model can't build a picture list without pictures, and it keeps enough to answer follow-ups ("save the third one," "tell me about the second story"). The "card above already shows this" note is attached to every result, because that's the text the model reads closest to its reply. Story details keep their summary and quotes, so questions about what was said in an episode still work.

**What we gave up:**
- The model may still write a short plain list of titles. It just can't build the picture version.
- If ChatGPT ever stops showing our card (a share link, an older app), the reply carries less: no pictures, no calendar link.
- This works by withholding data from the model, not by a setting OpenAI provides. If OpenAI adds a real "don't redraw this" switch, we should use that instead.

**How we'll know if this was right:** Re-running the six prompts from the October 8 chat shows one card and a sentence or two per answer, with no gray image boxes. Re-checked after the change for episodes, free weekend events and now playing on HYFIN: 3 of 3 passed. Over the beta, no tester reports seeing the same answer twice.

Related, same day: listener playlists went live ahead of the October 23 hold on rm-playlist-v2 PR #69 (Tarik's call). The playlist functions only added new tables, and "tarik jams" was created from ChatGPT to prove it worked.

**What actually happened:**
