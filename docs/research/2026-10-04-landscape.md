# Who else is doing this? Landscape research, October 2026

**Question:** Has any media outlet built something like Radio Commons: an MCP server (a standard way for an AI assistant to call a company's own tools) that brings a station's journalism and audio into Alexa+ or another assistant, for listeners?

**Short answer:** Not that we could find, in the US or abroad. The pieces exist separately — news agencies with MCP servers for business customers, an Amazon feature that turns newspaper articles into AI-voiced podcasts, podcast-search tools for investors, archive chatbots on newspaper websites, and hobbyist MCP servers that wrap a few broadcasters' public data feeds — but no broadcaster has built its own MCP server, and none connects its reporting, voices and community to listeners inside an assistant.

**Method:** Web searches on 2026-10-04 (news, developer blogs, GitHub, MCP directories), in English, German, French, Spanish/Catalan and the Nordic languages, covering US public radio (NPR, PRX, APM, WNYC), major US radio companies (iHeartMedia, Audacy, SiriusXM, Cumulus, Townsquare) and public broadcasters abroad (BBC, CBC/Radio-Canada, ABC Australia, RNZ, RTÉ, ARD/ZDF, Radio France, RTBF, RTS, RTVE, NRK, SVT, Sveriges Radio, Yle, DR, NPO). We read Amazon's developer announcement, TechCrunch on Radar, TheWrap on Alexa Podcasts, and the ZDF, Radio France and opendata.cat project pages in full; other rows rely on search results and linked summaries. Unannounced or private projects would not show up.

## The claim we can make

> Radio Commons is, as far as we can find, the first MCP server built by a radio station itself for its listeners — bringing a station's own journalism, voices and community into Alexa+.

Not "the first MCP for broadcasters": Bloomberg (which broadcasts on TV and radio) and Reuters run MCP servers for paying business customers, and independent developers have wrapped a few broadcasters' public data feeds (ZDF, Radio France, Sveriges Radio, Catalan radio, BBC headlines) in MCP servers. None of those was built by the broadcaster, and none is for listeners on Alexa+.

## The landscape

| Who | What they built | How it differs from Radio Commons |
| --- | --- | --- |
| **Amazon, "Alexa+ for Builders"** (preview, July 23, 2026) | Companies bring their own MCP server to Alexa+; MCP Apps (interactive cards inside the conversation) are supported | The platform Radio Commons is built for, not a competitor. Launch partners are travel, tickets, education and smart home (Priceline, Fandango, Headspace, Lyft, Canva and others). No news, radio or audio partners. |
| **Amazon, "Alexa Podcasts"** (May 19, 2026) | Alexa+ writes an AI-voiced podcast on any topic from AP, Reuters, The Washington Post and 200+ local newspapers | The closest thing inside Alexa+, and the opposite approach: synthetic hosts rewriting journalism. No radio stations among its sources. Radio Commons plays the station's own reporters and hosts, at the exact moment, with credit. |
| **Reuters** (July 2026) and **Bloomberg** | MCP servers that let customers' AI tools search their news and data | Business data products for subscribers. No listeners, no local, no audio moments. |
| **Radar, by Particle** (August 2026) | Transcribes 130,000+ podcasts; searchable quotes with timestamps, offered to AI agents over MCP | Same technique as "ask the episode", aimed at investors and brands ($29–$399 a month). No editor review, no local places or events, no listener experience. |
| **The Economist's ChatGPT app** (May 2026) | First major consumer news app inside ChatGPT: questions about its polling charts | Same idea — a publisher's own app inside an assistant — but national, narrow, ChatGPT only. |
| **Archive chatbots**: Washington Post "Ask The Post AI", FT "Ask FT", Philadelphia Inquirer "Dewey", Minnesota Star Tribune, Chapelboro (a radio station's site in Chapel Hill) | Answer questions from their own reporting, with links | On their own websites, text only. Not in an assistant; no audio moments, maps or events. |
| **Classic station Alexa skills** (NPR, MPR, WPLN, The Public's Radio and others) | "Alexa, play [station]": live stream, newscasts | Reported not to work with Alexa+ (from search summaries; not confirmed on Amazon's pages). |
| **Unofficial MCP servers over broadcasters' public data**: ZDF Mediathek (Germany), Radio France podcasts, Sveriges Radio P3 playlists, opendata.cat (titles and summaries of ~485,000 Catalan radio episodes: Catalunya Ràdio, RAC1, RTVE, Cadena SER), a BBC News headlines demo | Let an AI assistant search a broadcaster's catalog, schedule, playlist or headlines | Built by independent developers or a volunteer open-data group from public data feeds, not by the broadcasters. Catalog lookups: no editor review, no exact audio moments, no places or events, not on Alexa+. |
| **Public broadcasters abroad** (BBC, CBC/Radio-Canada, ABC Australia, RNZ, RTÉ, ARD, NRK, SVT, Yle, DR, NPO) | No official MCP server or Alexa+ experience found. The BBC uses generative AI to write text for BBC Sounds from live football commentary. | — |
| **Major US radio companies** (iHeartMedia, Audacy, SiriusXM, Cumulus, Townsquare) | No AI-assistant or MCP announcements found; 2026 news is about consolidation (SiriusXM–iHeart talks, Audacy stations on SiriusXM) | — |
| **US public radio networks** (NPR, PRX, American Public Media, WNYC) | No official MCP server, Alexa+ or ChatGPT app found | — |
| **Radio utility MCP servers** (internet-radio directory, Casthost) | Find stream links; run a station's automation | Tools for operators and hobbyists, not a station's journalism for listeners. |

## The music side

Radio Commons has three parts: stories, events and music. Music is the newest and least built (status below), and it has its own landscape.

| Who | What they built | How it differs from Radio Commons |
| --- | --- | --- |
| **Streaming services in assistants**: Spotify and Apple Music apps in ChatGPT; Alexa+ inside the Amazon Music app (Nov 2025) | Ask for music in plain language; the service plays it | Catalogs and algorithms. They know little about local artists missing from MusicBrainz and Discogs, and nothing a station's DJs and writers know. |
| **AI radio**: Futuri RadioGPT, Andon FM | AI hosts that pick songs and talk between them | Replace the human host. Radio Commons does the opposite: it carries the station's people and what they know. |
| **Hobbyist music MCP servers**: Spotify, Navidrome (personal libraries), Sveriges Radio P3 playlist | Let an assistant control a music account, a home library, or read one station's playlist | Tools, not a station's knowledge: no stories behind the songs, no local-artist facts, no editor. |
| **Public radio music stations** (KEXP, WXPN, KCRW, WFUV) | Playlists, local-artist spotlights, sessions | No assistant or MCP experience found. |

**Radio Milwaukee's music side, as of Oct 4, 2026**

- **Built:** Ladies First, the HYFIN interview series with women musicians: 17 episodes transcribed and analyzed, awaiting editor review. Staff picks and music events come through the event guide (the "free music" carousel, "What is Radio Milwaukee recommending?").
- **In progress:** a tool that enriches the station's live playlist data (the database behind the playlists on the station's websites) with facts about each song and artist.
- **Planned:** "What's playing?" and "Tell me about this song" on Alexa; Milwaukee Music Premieres (station-written facts about local tracks); MKE Concert Picks matched to events; Studio Milwaukee Sessions from their articles and set lists.

The difference: a streaming service knows the catalog; the station knows Milwaukee's artists. Premieres and sessions are station-written records of local music that the big catalogs mostly lack.

## Who listens on smart speakers

Smart speakers are common and public radio listeners adopted them early, but they are a small slice of total radio listening. The case for Radio Commons is what listeners can do there, not how many are there.

**General listeners (US)**

| Finding | Number | Source, and how solid |
| --- | --- | --- |
| Own a smart speaker (Americans 12+) | 39%, the biggest one-year jump since 2021 (up 4 points) | [Infinite Dial 2026](https://ssrs.com/news/the-power-of-audio-2026/) (Edison Research/SSRS). Confirmed on the publisher's page. |
| Smart speaker owners who listened to AM/FM radio through it in the past week | 18% | [Infinite Dial 2025](https://www.radioworld.com/news-and-business/programming-and-sales/streaming-and-social-media-habits-surge-says-infinite-dial), about 5,020 people. Confirmed. |
| Share of radio listening time on smart speakers, among radio's most loyal listeners | 4% (of 44% that is digital) | [Jacobs Media Techsurvey 2026](https://barrettmedia.com/2026/04/23/jacobs-media-techsurvey-2026-am-fm-radio-hits-all-time-low-as-digital-surges-to-44/), commercial station listeners. Confirmed. |
| Smart speakers' share of commercial radio's streamed listening | About 25% (streaming is 12% of all AM/FM listening) | [Amplifi Media](https://www.amplifimedia.com/blogstein-1/i704zb956fgep2rwe4teuu15liio0q). Quote confirmed; article year not stated. |
| AM/FM's share of ad-supported listening on smart speakers | The largest single source (38% to 54% depending on quarter) | Edison "Share of Ear" via [Westwood One](https://www.westwoodone.com/?p=27565) and [Radio Online](https://news.radio-online.com/articles/n47912/AM-FM-Radio-Dominates-Q2-2025-Edisons-Share-of-Ear). From search summaries that disagree: quote "the largest single source," not a percentage. |
| Alexa's share of smart speaker owners | 78% own an Alexa device, vs. 30% Google | NPR/Edison data cited in [Nieman Reports](https://niemanreports.org/reimagining-audio-news/). From around 2018–19. |

**Public radio listeners**

| Finding | Number | Source, and how solid |
| --- | --- | --- |
| NPR member stations' streaming that came through smart speakers | 16%, system-wide | [Nieman Reports](https://niemanreports.org/reimagining-audio-news/), Q1 2018. Confirmed, but 8 years old. |
| KCUR (Kansas City), one week | 38% of its streaming via smart speakers, more than phones or computers | Same article, January 2018. Confirmed. The station promoted "ask Alexa" on air. |
| Public radio listening that is digital (smart speakers, apps, computers, podcasts combined) | 36% | [Public Radio Techsurvey 2020](https://jacobsmedia.com/prts-2020-results/), 19,015 listeners at 53 stations. Confirmed; smart speakers not broken out, and no public-radio edition found after 2020. |
| News drives smart speaker use | 28% of owners listen to more news and talk since getting one | NPR/Edison [Smart Audio Report](https://www.nationalpublicmedia.com/insights/reports/smart-audio-report/) (via [MediaVillage](https://www.mediavillage.com/article/npr-and-edison-research-report-smart-audio-making-big-gains/amp/)). From search summaries; an older edition. |

**Radio Milwaukee's own streams (August 2026, Triton)**

Smart speakers are the largest device for Radio Milwaukee's streams by listening time: a small group of listeners who stay tuned far longer than anyone else.

| Device | Share of streaming listening hours |
| --- | --- |
| Smart speakers (all brands: Echo, Nest, Sonos, Bose and others) | 40.0% |
| Mobile | 28.8% |
| Desktop / laptop | 26.6% |
| Digital media player | 1.9% |
| Unspecified / unknown | 2.4% |
| Car entertainment system | 0.1% |
| Smart TV | 0.1% |

- Smart speaker listeners are a small minority of the station's stream listeners by headcount, yet each listens about 9 times as long as a mobile listener (calculated from Triton's shares and listener counts; not a Triton figure).
- "Smart speakers" is every brand, not Alexa alone; Triton's device-level data can split out Amazon Echo.
- Source: Triton streaming data, all four station brands combined, August 2026.

**What it means for Radio Commons**

1. **The habit is real; don't overclaim the size.** About two in five Americans own a smart speaker, and public radio listeners were early users (16% of NPR streaming in 2018, 38% at one station). But smart speakers are about 4% of radio listening time for radio's most loyal listeners. Avoid "smart speakers are where radio listeners are."
2. **The argument is what listeners can do there.** Today a public radio listener can only say "Alexa, play the station," and those old skills don't carry over to Alexa+. News is a main reason people use smart speakers. Radio Commons turns the play button into a conversation with the station's journalism and music.
3. **The best number is Radio Milwaukee's own.** Smart speakers carry 40% of the station's stream listening hours, more than mobile (29%) or desktop (27%), from listeners who each stay about 9 times as long as mobile listeners. The station's most loyal stream listeners are already on smart speakers, and all they can do there today is press play.

**Gaps:** no public-radio-specific smart speaker figure newer than 2020 is published (NPR likely has one internally); the full Infinite Dial 2026 report was not available, so the "listened to radio" figure is from 2025.

## What makes Radio Commons different

1. **The station's own voices.** Alexa plays the reporter or host at the exact moment that answers the question, rather than generating a synthetic summary.
2. **An editor approves everything.** Nothing reaches Alexa until a Radio Milwaukee editor has reviewed the people, places and quotes. Names an editor keeps off Alexa are never spoken or quoted.
3. **Back to the community.** Every answer can lead somewhere real: directions to the place, upcoming events nearby from the station's event guide, a restaurant reservation, the station's staff picks.
4. **Local music, from the people who play it.** The station's playlist and its writing about local artists — premieres, sessions, interviews — instead of a streaming catalog that barely knows them. (In progress; see the music side above.)
5. **Built on Amazon's own path.** An MCP server with MCP Apps cards, following Amazon's design guide for Echo Show, maps from Amazon Location, the AI brain on Amazon Bedrock.

## Ready-to-adapt versions

Starting points only. They describe the full product as planned for Oct 23 — stories, events and music — so trim any feature that hasn't shipped by then. The facts above are what they rest on.

**Devpost, "Inspiration" (about 120 words)**

> Alexa+ can already turn newspaper articles into AI-voiced podcasts, and Spotify and Amazon Music answer song requests from their catalogs. But no radio station — in the US or abroad — had brought itself into the assistant, and public radio's old Alexa skills don't carry over to Alexa+. Radio Commons is, as far as we can find, the first MCP server built by a radio station itself for its listeners. Ask about a story you half-remember and Alexa plays the moment the host said it. Ask what's playing on 88Nine and hear the story behind the song, including Milwaukee artists the streaming catalogs barely know, from the station's own premieres and artist interviews. Then find the place, the show or tonight's event. Every fact is approved by a station editor.

**Demo voiceover (about 15 seconds)**

> "Alexa+ can read you the news in a synthetic voice. Radio Commons brings you back to your local station: the moment a story was told, the story behind the song on the air, and where to go next in Milwaukee."

**Portfolio case study, "The opportunity"**

> Before building, I mapped what already existed. News agencies (Reuters, Bloomberg) had MCP servers for enterprise customers. Amazon had launched AI-generated podcasts from newspaper content and opened Alexa+ to outside MCP servers, but only to travel, ticketing and smart-home brands. Music was the same story: Spotify, Apple Music and Amazon Music answered requests from catalogs that barely know Milwaukee's artists, while the station knows them through its premieres, sessions and interviews. Public radio's voice-assistant presence was still a "play the stream" skill that doesn't work on Alexa+. That gap — local, trusted, audio-first journalism and music inside the assistant — set the product bet: keep the station's real voices and editorial control, and make every answer lead somewhere in the community: a place, a show, a song.

**LinkedIn post**

> Amazon opened Alexa+ to outside developers this summer. The first partners: Priceline, Lyft, Fandango, Headspace.
>
> No news. No radio. No local anything.
>
> So for the Alexa+ hackathon I built Radio Commons for Radio Milwaukee:
>
> - Ask about a story you half-remember, and Alexa plays the moment the host said it and shows the place on a map.
> - Ask what's playing on 88Nine, and hear the story behind the song, even for Milwaukee artists Spotify barely knows, from our own premieres and artist interviews.
> - Ask what's on tonight, and get nearby shows and events from our event guide, plus what our staff recommends.
>
> Underneath is Backstory, a story engine I built for the station. For every new episode of This Bites, Uniquely Milwaukee and Ladies First, it:
>
> 1. Pulls the episode from NPR's content system, where the station already publishes it.
> 2. Transcribes the whole thing with Deepgram, with speaker labels, so it knows who said what, and when.
> 3. Has Claude (on Amazon Bedrock) read the transcript and pull out the people, places, topics and things to do. Every item must come with the exact quote that supports it, and Backstory checks that quote against the transcript.
> 4. Puts the places on a map with Amazon Location.
> 5. Waits for a station editor to approve it. Nothing reaches Alexa before that.
>
> 48 episodes so far, across three shows. The transcript is why Alexa can play the exact moment: it knows the second the host said "stromboli."
>
> I checked the US and public broadcasters abroad: as far as I can find, it's the first MCP server a radio station has built itself for its listeners. Here's what I learned building it.

**Short post (Bluesky / Threads; 295 characters, over X's 280)**

> Alexa+ can write you an AI podcast from the news. I built the opposite: Radio Commons brings Radio Milwaukee into Alexa+: real hosts, the story behind the song on 88Nine, local artists, places and shows. Every fact editor-approved. First station-built MCP server for listeners, as far as I know.

## Sources

- Amazon: [Alexa+ launches new ways to build experiences (Jul 23, 2026)](https://developer.amazon.com/alexaplus/blogs/2026/07/alexa-plus-new-ways-to-build-experiences) · [Alexa+ for Builders](https://developer.amazon.com/alexaplus) · [Alexa+ developer docs](https://developer.amazon.com/docs/alexaplus/add-ons/home.html) · [AI-native SDKs for Alexa+ (Feb 2025)](https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2025/02/new-alexa-announce-blog)
- Alexa Podcasts: [TheWrap](https://www.thewrap.com/industry-news/tech/amazon-ai-podcasts-alexa-plus-on-demand/) · Amazon's news-partner outreach: [Axios](https://axios.com/2024/12/03/amazon-news-partners-revamped-ai-alexa-voice-assistant)
- Publisher MCP servers: [Reuters (Editor & Publisher)](https://www.editorandpublisher.com/stories/reuters-launches-model-context-protocol-server-to-bring-trusted-news-directly-into-customers-ai,262502) · [Bloomberg](https://www.bloomberg.com/company/press/bloomberg-launches-enterprise-mcp-to-seamlessly-connect-bloomberg-data-with-clients-enterprise-ai-applications/) · [Digiday: MCP and publishers](https://digiday.com/media/wtf-is-model-context-protocol-mcp-and-why-should-publishers-care/)
- Podcasts for AI agents: [Radar (TechCrunch, Aug 26, 2026)](https://techcrunch.com/2026/08/26/radar-makes-podcasts-searchable-and-usable-by-ai-agents/)
- Publisher apps in assistants: [The Economist's ChatGPT app (Nieman Lab)](https://www.niemanlab.org/2026/05/the-economist-launches-a-dedicated-chatgpt-app/) · [INMA](https://www.inma.org/blogs/product-initiative/post.cfm/chatgpt-apps-bring-a-new-era-for-news-distribution)
- Archive chatbots: [Nieman Lab](https://www.niemanlab.org/2025/08/local-newsrooms-are-building-ai-chatbots-fast-and-cheap/) · [GIJN](https://gijn.org/stories/newsrooms-using-ai-chatbots-leverage-reporting/) · [Lenfest Institute (Inquirer's Dewey)](https://lenfestinstitute.org/solutions-resources/philadelphia-inquirer-scrape-ai-hyperlocal-news)
- Station Alexa skills: [WUFT](https://www.wuft.org/smart-speakers) · [NPR](https://www.npr.org/about-npr/560999519/listening-to-npr-with-alexa)
- Unofficial broadcaster MCP servers: [ZDF Mediathek MCP](https://github.com/Nicklas2751/zdfmediathek-mcp) · [Radio France podcast explorer](https://github.com/infinitimeless/radiofrance-podcast-explorer-mcp) · [SR P3 MCP](https://glama.ai/mcp/servers/kyjw1cdb6o) · [opendata.cat MCP](https://opendata.cat/mcp/) · [BBC News MCP demo](https://mcp.so/servers/bbc-news-mcp-server-demo?tab=config)
- BBC and AI: [The Register](https://www.theregister.com/2025/12/18/bbc_ai_explain/) · US radio 2026: [Axios (SiriusXM–iHeart)](https://www.axios.com/2026/04/28/siriusxm-iheart-talks-audio) · [NorthEast Radio Watch (Audacy–SiriusXM)](https://www.fybush.com/nerw-20260727/)
- Alexa+ MCP Toolkit: [Amazon docs](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html)
- Music: [Alexa+ in Amazon Music (TechCrunch)](https://techcrunch.com/2025/11/04/alexa-comes-to-the-amazon-music-app) · [Tom's Guide](https://www.tomsguide.com/ai/alexa-rolling-out-now-in-amazon-music-app-heres-what-you-can-do-now) · [RadioGPT (Mixmag)](https://mixmag.net/read/ai-generated-radiogpt-broadcast-voice-dj-music-find-local-stories-news) · [Andon FM](https://andonlabs.com/radio) · [Spotify MCP](https://glama.ai/mcp/servers/@latiftplgu/Spotify-OAuth-MCP-server)
- Radio utility MCP servers: [internet-radio-mcp](https://github.com/AlonDrilich/internet-radio-mcp) · [Casthost Radio](https://www.pulsemcp.com/servers/casthost-radio)
