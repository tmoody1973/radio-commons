# The problem Radio Commons solves (research, October 6, 2026)

*Researched for the Devpost write-up and the demo video. Every figure has a source below; figures from monthly or quarterly indexes change, so re-check them before submitting. See "Could not verify" before quoting anything.*

## 1. Federal funding is gone

- **The rescission.** The Rescissions Act of 2025 (signed July 24, 2025) clawed back about $1.1B already appropriated to the Corporation for Public Broadcasting (CPB) through FY2027; the FY2026 Senate bill left CPB out entirely. Federal money to stations stopped October 1, 2025. CPB announced its closure August 1, 2025 and its board voted to dissolve (reported January 8, 2026).
- **Who depended on it.** CPB funded more than 1,500 stations; roughly 70% of its money went straight to about 600 NPR and PBS stations. It was 17% of the average rural station's revenue (9% non-rural); about 50 stations relied on it for at least half.
- **The network.** NPR expected $15M less in station fees and an $8M gap; in May 2026 it offered buyouts to about 300 newsroom staff. About 550 public media jobs were lost between July 2025 and May 2026 (Semipublic tracker; NPR says "more than 500").
- **Wisconsin.**
  - **88Nine Radio Milwaukee:** CPB was under 10% of the budget (Executive Director Jordan Lee). It paid for broadcasting every Milwaukee Public Schools board meeting.
  - **WUWM:** lost about $320K a year, roughly 6% of its budget.
  - **Wisconsin Public Media:** lost $6M, about 10% of its budget. WPR laid off at least 15 staff and ended four shows.
  - **WXPR (Rhinelander):** lost 25% of its budget. It is down to 5 full-time staff and one reporter covering nine counties.

## 2. The donor surge is fading, and donors give for local

- **The surge:** membership revenue rose 68.6% in the three months to August 2025 (radio +73.2%), and new donors rose 200%.
- **By May–July 2026 it had turned:**
  - Membership revenue was −0.8% system-wide and **−7% at radio-only stations**.
  - **New donors fell 75% at radio.**
  - Monthly sustainers were the one bright spot, up 14%.
  
  (CDP Index via Current, September 10, 2026.)
- **What new donors want** (Greater Public/City Square FUND 2026, July 2026):
  - The median new donor is 57; 34% are Millennial or younger.
  - Just over three-quarters rank **local services** above national programs.
  - **55% want more local**, especially local news and local music and arts.
  - The best message is how the cuts affect *their* station.
- **Other money:**
  - Foundations pledged $36.5M.
  - The Public Media Bridge Fund (an emergency fund) granted $26M to 74 organizations in December 2025.
  - Underwriting (corporate sponsorship) is falling.

## 3. Attention has moved to speakers, streams and AI answers

- **Smart speakers grew again:** 39% of Americans 12+ own one, about 112 million people, up from 35% after four flat years (Edison Infinite Dial 2026).
- **In the car:** AM/FM fell from 84% (2016) to about 73%; online audio rose from 21% to 48%.
- **88Nine's own numbers:** 40% of streaming listening hours are on smart speakers (Triton, August 2026; station data).
- **Alexa+:**
  - It became generally available February 4, 2026, free with Prime.
  - Third parties now integrate through the MCP Toolkit or a Category SDK; Amazon's integration guide doesn't mention classic custom skills.
  - **Alexa Podcasts** (May 2026) generates AI-hosted episodes from 200+ licensed newsrooms, and no public radio partner is named. Listeners "have no reason to visit the publisher" (TNW).
- **AI answers pull people away from sources:**
  - Google users clicked a result 8% of the time with an AI summary versus 15% without (Pew, 2025).
  - Weekly news use of AI chatbots rose to 10% globally, 17% of 18–24s, and only 4% of users check the source (Reuters Institute 2026).

## 4. Problem statements

**Recommended Devpost lead (two sentences):**
> With federal funding gone and the donor surge fading, public radio's survival depends on staying close to its listeners, and those listeners increasingly ask an AI assistant instead of tuning in (40% of 88Nine's streaming hours already run through smart speakers). Radio Commons puts a station's own stories, songs, events and membership inside Alexa+, so when Milwaukee asks, the answer comes from the station that covers it.

**Video hook (one sentence):**
> "Ask Alexa what's happening in Milwaukee, and it won't send you to the station that covers it. Radio Commons fixes that."

The three framings below each lean on a different set of facts:
- **Listener pain:** about 112M Americans own a smart speaker, but Alexa answers local questions from national licenses, not the station they trust.
- **Station survival:**
  - The rescission and CPB's dissolution.
  - Radio membership revenue −7% and new donors −75%.
  - Donors give for local service, but the place listening and giving now happen can't see the station or take a gift.
- **Civic information:** 500+ jobs gone and rural newsrooms down to one reporter, while AI answers halve clicks to sources and 4% check where answers come from.

**Be honest about 88Nine.** CPB was under 10% of its budget, so this is an industry story, not "88Nine is closing". The station-survival case is strongest for small and rural stations, which is exactly who a shared, open-source tool helps most.

## Sources

- NBC News, CPB to shut down, 2025-08-01: https://www.nbcnews.com/politics/congress/cpb-funder-npr-pbs-says-will-shut-congress-cuts-money-rcna222524
- NewscastStudio, CPB closure, 2025-08-01: https://www.newscaststudio.com/2025/08/01/corporation-for-public-broadcasting-plans-closure-by-january-2026
- Radio Milwaukee, funding cuts, 2025-10-02: https://radiomilwaukee.org/podcast/uniquely-milwaukee/2025-10-02/public-media-funding-cuts-stations-closing
- WPR via Wausau Pilot, 2025-07-19: https://wausaupilotandreview.com/ga/2025/07/19/wisconsin-public-media-outlets-react-as-federal-funding-cut-heads-to-presidents-desk/
- WUWM, 2025-08-07: https://www.wuwm.com/this-is-wuwm/2025-08-07/what-no-federal-funding-for-public-media-means-for-wuwm
- WEAU, 2026-01-08: https://www.weau.com/2026/01/08/wisconsin-public-radio-pbs-wisconsin-continue-services-despite-closure-corporation-public-broadcasting/
- RadioInsight, WPR layoffs: https://radioinsight.com/headlines/302834/wisconsin-public-radio-to-end-four-shows-lay-off-fifteen-staffers/
- UPR/NPR, one year later, 2026-07-22: https://www.upr.org/2026-07-22/in-south-dakota-public-media-endures-a-year-after-federal-funding-was-wiped-out
- OPB/NPR, NPR buyouts, 2026-05-18: https://www.opb.org/article/2026/05/18/npr-offers-newsroom-buyouts-layoffs-could-follow/
- Current, CDP Index August 2026, 2026-09-10: https://current.org/?p=8010162 ; August 2025: https://current.org/?p=8004977
- Greater Public/City Square, FUND 2026: https://greaterpublic.org/app/uploads/2026/07/FUND-2026-Executive-Summary-070626-V2.pdf
- Current, Bridge Fund grants: https://current.org/?p=8006285 ; MacArthur: https://www.macfound.org/press/press-releases/foundations-commit-36-million-to-protect-public-media-in-communities
- Current, CPB and rural stations: https://current.org/?p=1706694
- Edison Research, Infinite Dial 2026: https://www.edisonresearch.com/wp-content/uploads/2026/03/The-Infinite-Dial-2026-Presentation.pdf
- MacRumors, Alexa+ GA, 2026-02-04: https://www.macrumors.com/2026/02/04/amazon-alexa-plus-prime
- Amazon, choose the Alexa+ integration approach: https://developer.amazon.com/docs/alexaplus/add-ons/choose-the-proper-alexaplus-integration-approach.html
- TNW, Alexa Podcasts, 2026-05-18: https://thenextweb.com/news/amazon-alexa-podcasts-ai-generated-episodes
- Pew, AI summaries and clicks, 2025-07-22: https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/
- The Decoder (Reuters Digital News Report 2026): https://the-decoder.com/more-people-get-news-from-ai-chatbots-but-trust-remains-low/

## Could not verify

- **Radio stations that went dark:** no confirmed count. The confirmed closures are TV or university licensees, so **don't claim radio closures**. Also avoid "hundreds of outlets closed", which appears unsourced on a Radio Milwaukee page.
- **Classic skills on Alexa+:** not traced to Amazon. Say "new integrations use MCP", not "skills are broken".
- **Read secondhand, not at the source:**
  - The 550-jobs figure and the Nieman Lab piece (search snippet only).
  - CPB's own site, which is offline.
  - The "200+ newsrooms" count, which comes from TNW, not Amazon.
- **Share-of-Ear figures** come via Westwood One, a radio ad seller, so they weren't used above.
- **Index figures** (CDP, NPR) change monthly or quarterly; re-check before submitting.
