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

## What makes Radio Commons different

1. **The station's own voices.** Alexa plays the reporter or host at the exact moment that answers the question, rather than generating a synthetic summary.
2. **An editor approves everything.** Nothing reaches Alexa until a Radio Milwaukee editor has reviewed the people, places and quotes. Names an editor keeps off Alexa are never spoken or quoted.
3. **Back to the community.** Every answer can lead somewhere real: directions to the place, upcoming events nearby from the station's event guide, a restaurant reservation, the station's staff picks.
4. **Built on Amazon's own path.** An MCP server with MCP Apps cards, following Amazon's design guide for Echo Show, maps from Amazon Location, the AI brain on Amazon Bedrock.

## Ready-to-adapt versions

*Drafts. Rewrite them in your own voice before using them; the facts and sources above are what they rest on.*

**Devpost, "Inspiration" or "What's unique" (about 90 words)**

> Alexa+ can already turn newspaper articles into AI-voiced podcasts, and companies like Priceline and Lyft can plug their own tools into it. But no radio station — in the US or abroad — had brought its own journalism there, and public radio's old Alexa skills don't carry over to Alexa+. Radio Commons is, as far as we can find, the first MCP server built by a radio station itself for its listeners: the station's own reporters and hosts, every fact approved by an editor, and every answer leading back to a real place, event or show in Milwaukee.

**Demo voiceover (one line, about 15 seconds)**

> "Alexa+ can read you the news in a synthetic voice. Radio Commons does something nobody else has: it brings you back to your local station — its people, its places, the exact moment a story was told."

**Portfolio case study, "The opportunity" (PM framing)**

> Before building, I mapped what already existed. News agencies (Reuters, Bloomberg) had MCP servers for enterprise customers; Amazon had launched AI-generated podcasts from newspaper content and opened Alexa+ to outside MCP servers — but only to travel, ticketing and smart-home brands. Public radio's voice-assistant presence was still a "play the stream" skill that doesn't work on Alexa+. That gap — local, trusted, audio-first journalism inside the assistant — set the product bet: keep the station's real voices and editorial control, and make every answer lead somewhere in the community.

**LinkedIn post (draft)**

> Amazon opened Alexa+ to outside developers this summer. The first partners: Priceline, Lyft, Fandango, Headspace.
>
> No news. No radio. No local anything.
>
> So for the Alexa+ hackathon I built Radio Commons for Radio Milwaukee: ask Alexa about a story you half-remember, and it plays the moment the host said it, shows the place on a map, and tells you what's happening nearby tonight from our event guide. Every fact approved by a station editor.
>
> I checked the US and public broadcasters abroad: as far as I can find, it's the first MCP server a radio station has built itself for its listeners. Here's what I learned building it 👇

**Short post (Bluesky / X / Threads)**

> Alexa+ can now write you an AI podcast from newspaper stories. I built the opposite: Radio Commons puts Radio Milwaukee's real hosts, local places and events into Alexa+ — every fact approved by a station editor. First radio station to build its own MCP server for listeners, as far as I can find.

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
- Radio utility MCP servers: [internet-radio-mcp](https://github.com/AlonDrilich/internet-radio-mcp) · [Casthost Radio](https://www.pulsemcp.com/servers/casthost-radio)
