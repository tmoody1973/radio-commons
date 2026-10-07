# 012: Beta feedback is drafted and sent inside ChatGPT, to the station inbox

**Decision:** Radio Milwaukee in ChatGPT is labeled Beta, and listeners send feedback from inside the chat: ChatGPT drafts it on a preview card, and tapping Send emails it to digital@radiomilwaukee.org. A `/support` page gives the same address for people outside the chat.

**Why this came up:** Before inviting listeners to try the app, Tarik wanted it clearly marked as beta and a place for people to report problems. OpenAI's app directory also requires a support contact. If reporting a problem is hard (copying an address into a mail app on a phone), most testers simply won't, and the beta teaches us little.

**Options:**
1. **Draft and Send in the chat.** Reuses the song-request path built in slice 5 (preview card, sealed Send token, email through Resend, 3 a day). Cost: a new ChatGPT tool, sign-in required to send, and feedback shares the daily limit with requests.
2. **Show the email address only.** Nothing to build. Cost: listeners leave ChatGPT and copy the address into a mail app; few will.
3. **A feedback form on the website.** Familiar. Cost: a form to build and protect from spam, and it's outside the chat where the problem happened.

**What we chose and why:** Option 1, sent to digital@radiomilwaukee.org (Tarik chose both). It meets testers where the problem happens, and the email subject "Beta feedback (ChatGPT): …" keeps feedback apart from song requests in the same inbox. Option 2 lives on as the `/support` page, which OpenAI requires anyway.

**What we gave up:**
- Signed-out listeners can't send feedback in the chat; they have the email address on `/support`.
- One shared limit: a listener who sent three song requests today can't send feedback until tomorrow.
- Feedback has no screenshot; the support page asks people to email one if they can.
- Requests and feedback land in one inbox, sorted only by subject line.

**How we'll know if this was right:** In the first month of the beta, most problem reports arrive through the in-chat card rather than by plain email, and no tester says they couldn't find how to report something.

**What actually happened:**
