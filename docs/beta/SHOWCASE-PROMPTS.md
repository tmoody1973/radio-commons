# Showcase prompts: Radio Milwaukee in ChatGPT

One or more prompts for each of the app's 30 tools (tool list read from the test server on 2026-10-08), grouped the way a listener thinks. ⭐ marks the strongest moments for a demo video. 🔑 means the listener must be signed in.

Start the first message in a chat with **@Radio Milwaukee**. After that, plain follow-ups work.

Prompts that name a specific episode or time depend on what's current, so run them in a rehearsal before recording; the video plan does that.

## The station at a glance

| Prompt | Tool | What you see |
|---|---|---|
| ⭐ "Open Radio Milwaukee" | `station_home` | One card: all four stations on air now, the newest episode of each show, this week's highlights, your Finds, and Try asking questions |
| "What can you do?" | `what_can_you_do` | A short tour with an example for each feature |

## Listen and find that song

| Prompt | Tool | What you see |
|---|---|---|
| ⭐ "What's playing on HYFIN right now?" | `on_air_now` | Song, artist, album art and ▶ Listen live, which plays in the chat |
| "What's on all four stations?" | `on_air_now` | 88Nine, HYFIN, Rhythm Lab and 414 Music side by side |
| "The last five songs on 88Nine" | `recent_songs` | Numbered list with Preview and Save |
| ⭐ "What played on HYFIN between 8 and 8:30 this morning?" | `find_song_played` | Every song in that window, newest first, each ready to save |
| "When did you last play Thao?" | `search_playlist` | Every recent play, about two weeks back |
| "Tell me about that song" | `get_track_story` | Credits, album, year, and the artist's next local show |
| "Who's on 88Nine right now?" / "When is Rhythm Lab on?" | `station_schedule` | Host, show and weekly times |

## Save and follow 🔑

| Prompt | Tool | What you see |
|---|---|---|
| ⭐ "Save number 2" (or tap Save) | `save_find` | Saved ✓, also on Alexa and Apple Music if connected |
| "What's in my Finds?" | `list_finds` | Your saved songs |
| "Follow Tank and the Bangas" | `follow_artist` | Following ✓ |
| "Stop following Thao" | `unfollow_artist` | Unfollowed |
| "What's new for me?" | `whats_new_for_me` | Since your last visit: plays, shows and stories for the artists you follow |
| "Delete my Finds" | `delete_my_finds` | Asks to confirm first |

## Stories and podcasts (the archive)

| Prompt | Tool | What you see |
|---|---|---|
| ⭐ "What's new on Uniquely Milwaukee?" | `latest_station_stories` | The newest episodes as cards with show art |
| "What was that This Bites episode about frugal dining?" | `find_station_story` | Finds an episode by what you half-remember |
| "Tell me about the My Way Out story" | `get_station_story` | The story card with ▶ Play episode, summary and Places |
| ⭐ A detail question about an episode, e.g. "What did they say about [a dish, a person, a place]?" | `ask_station_story` | The answer in the episode's own words, the moment it's heard ("At 10:45…") and ▶ Play from there |
| ⭐ "What restaurants were discussed in the latest This Bites?" | `get_station_story` (Places) | The places on a map, numbered; See all for a full map |

## Milwaukee this week

| Prompt | Tool | What you see |
|---|---|---|
| ⭐ "What's happening in Milwaukee this weekend?" | `find_events` | Event cards with Add to calendar and Details |
| "Any free events tonight?" | `find_events` | Filtered list |
| "What is Radio Milwaukee recommending?" | `station_picks` | Staff picks and the weekly MKE Concert Picks |
| "Which artists HYFIN plays have concerts coming up?" | `station_artist_shows` | Shows by artists our DJs actually play, Milwaukee first |
| ⭐ "What's new at Radio Milwaukee this week?" | `station_briefing` | The newsletter's highlights; tap Read to open an article in the chat |
| "Read the Milwaukee With Kids weekend guide" | `read_article` | The article in a card: photo, headline, the opening, and the whole piece in full screen |

## Talk to the station 🔑

| Prompt | Tool | What you see |
|---|---|---|
| ⭐ "Request No ID by Tank and the Bangas" | `send_station_request` | A preview of exactly what the DJs will get; nothing is sent until you tap Send. **Sending emails the real station inbox.** |
| "Suggest Johnny Cash's Hurt for 5 O'Clock Shadow" | `send_station_request` | Same, as a 5 O'Clock Shadow suggestion (88Nine's daily 5 pm cover) |
| "Send feedback: the map took a while to open" | `send_feedback` | A feedback card; Send emails the team |

## Playlists 🔑 (after rm-playlist-v2 #69 is live)

| Prompt | Tool | What you see |
|---|---|---|
| "Make a playlist called Road Trip" | `create_playlist` | The empty playlist |
| "Add that song to Road Trip" | `add_to_playlist` | Added ✓ (makes the playlist if it doesn't exist) |
| "Show my playlists" / "Show Road Trip" | `show_playlists` | Your playlists, or one with Remove on each song |
| "Remove the Thao song from Road Trip" | `remove_from_playlist` | Removed |
| "Delete my Road Trip playlist" | `delete_playlist` | Asks to confirm first |

Until then these answer "Playlists aren't available yet", so keep them out of any demo.
