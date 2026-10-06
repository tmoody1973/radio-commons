import { describe, expect, it } from "vitest";
import { AUTH_TOOLS } from "@/lib/listenerAuth";
import { LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH } from "@/lib/speech";
import { buildMcpHandler, CARD_URI } from "@/lib/mcp";
import { renderView } from "@/lib/card";
import { isOpenableLink } from "@/lib/maps";
import { openListener } from "@/lib/give/token";
import type { Give } from "@/lib/give";
import type { PayClient } from "@/lib/give/amazonPay";
import type { Membership, MembershipStore } from "@/lib/give/membership";
import { fakeBackstory, fakeFieldGuide, fakePlaylist } from "./fixtures";
import { mcpPost, mcpPostAs } from "./mcp-wire";

const SECRET = "a-test-secret-that-is-long-enough-000000";
const NOW = new Date("2026-10-05T15:00:00Z");
const MEMBER: Membership = { chargePermissionId: "B01-1", tierId: "main-floor-monthly", amount: "10.00", startedAt: NOW.getTime(), lastChargedPeriod: "2026-10", status: "active" };
const call = (name: string, args: Record<string, unknown> = {}) => ({ method: "tools/call", params: { name, arguments: args } });

function memoryStore(initial: Record<string, Membership> = {}): MembershipStore & { saved: Record<string, Membership> } {
  const saved = { ...initial };
  return { saved, get: async (id) => saved[id] ?? null, set: async (id, m) => { saved[id] = m; } };
}

function fakeGive(memberships: MembershipStore | null = memoryStore(), closed: string[] = []): Give {
  const pay = { closeChargePermission: async (id: string) => { closed.push(id); return { status: 200, data: {} }; } } as unknown as PayClient;
  return { tokenSecret: SECRET, pay: async () => pay, memberships };
}

const handler = (give: Give | null) =>
  buildMcpHandler({ backstory: () => fakeBackstory(), fieldGuide: () => fakeFieldGuide(), playlist: () => fakePlaylist(), now: () => NOW, defer: (task) => void task(), cardHtml: () => "", give: () => give });

describe("support_radio_milwaukee", () => {
  it("is a card tool that needs no linked account", async () => {
    const { message } = await mcpPost(handler(fakeGive()), { method: "tools/list" });
    const tool = message.result.tools.find((t: { name: string }) => t.name === "support_radio_milwaukee");
    expect(tool._meta.ui.resourceUri).toBe(CARD_URI);
    expect(AUTH_TOOLS as readonly string[]).not.toContain("support_radio_milwaukee");
  });

  it("says it's a demo and shows the give card; a linked listener's links carry a sealed token for them", async () => {
    const { message } = await mcpPostAs(handler(fakeGive()), call("support_radio_milwaukee"), "user_42");
    expect(message.result.isError).toBeFalsy();
    expect(message.result.content[0].text).toMatch(/demo/i);
    expect(message.result.content[0].text).toMatch(/t-shirt size.*radiomilwaukee\.org slash give/i);
    const data = message.result.structuredContent;
    expect(data.view).toBe("give");
    const links: string[] = Object.values(data.links);
    expect(links).toHaveLength(8);
    for (const link of links) {
      const url = new URL(link);
      expect(url.pathname).toBe("/give");
      expect(link).not.toContain("user_42");
      expect(openListener(url.searchParams.get("t"), SECRET, NOW.getTime() + 14 * 60_000)).toBe("user_42");
      expect(openListener(url.searchParams.get("t"), SECRET, NOW.getTime() + 16 * 60_000)).toBeNull();
      expect(isOpenableLink(link)).toBe(true);
    }
  });

  it("an unlinked listener's links carry no token", async () => {
    const { message } = await mcpPost(handler(fakeGive()), call("support_radio_milwaukee"));
    for (const link of Object.values(message.result.structuredContent.links) as string[]) expect(new URL(link).searchParams.has("t")).toBe(false);
  });

  it("without the Amazon Pay settings, says donations aren't set up and shows no card", async () => {
    const { message } = await mcpPost(handler(null), call("support_radio_milwaukee"));
    expect(message.result.content[0].text).toMatch(/aren't set up yet/);
    expect(message.result.structuredContent?.view).toBeUndefined();
  });
});

describe("give card", () => {
  const links = Object.fromEntries(["ga", "main-floor", "front-row", "vip"].flatMap((l) => ["monthly", "once"].map((k) => [`${l}-${k}`, `https://radio-commons.vercel.app/give?tier=${l}-${k}&t=a<b"`])));
  const html = renderView({ view: "give", links, qrSvg: "<svg></svg>", shortUrl: "radio-commons.vercel.app/give" });
  it("shows the four levels monthly and one time, a DEMO badge, more levels, and the QR fallback", () => {
    expect(html.match(/class="secondary details give-tier"/g)).toHaveLength(8);
    for (const text of ["General Admission", "Main Floor", "Front Row", "VIP", "$5", "$10", "$20", "$42", "$60", "$120", "$240", "$500"]) expect(html).toContain(text);
    expect(html).toContain("DEMO · Amazon Pay sandbox · no real money");
    expect(html).toContain("More levels on radiomilwaukee.org");
    expect(html).toContain("<svg></svg>");
    expect(html).toContain("radio-commons.vercel.app/give");
    expect(html).not.toMatch(/501\(c\)|tax/i);
  });
  it("shows each level's gift once per kind", () => {
    for (const line of ["Green Room newsletter", "RadioMKE t-shirt", "Merch package: t-shirt + sticker", "VIP: hat, t-shirt, sticker + Studio Milwaukee Sessions for two"]) {
      expect(html.split(`<i>${line}</i>`)).toHaveLength(3);
    }
  });
  it("escapes the links", () => {
    expect(html).toContain("tier=vip-once&amp;t=a&lt;b&quot;");
    expect(html).not.toContain('t=a<b"');
  });
});

describe("cancel_membership", () => {
  it("needs a linked account and warns it's destructive", async () => {
    expect(AUTH_TOOLS as readonly string[]).toContain("cancel_membership");
    const { message } = await mcpPost(handler(fakeGive()), { method: "tools/list" });
    const tool = message.result.tools.find((t: { name: string }) => t.name === "cancel_membership");
    expect(tool.annotations).toMatchObject({ destructiveHint: true });
    expect(tool.description).toMatch(/confirm/i);
  });

  it("asks to confirm first, naming the amount, and closes nothing", async () => {
    const closed: string[] = [];
    const { message } = await mcpPostAs(handler(fakeGive(memoryStore({ user_1: MEMBER }), closed)), call("cancel_membership"), "user_1");
    expect(message.result.content[0].text).toBe("Cancel your $10 monthly membership? You won't be charged again.");
    expect(closed).toEqual([]);
  });

  it("confirmed: closes the charge permission once and records it cancelled", async () => {
    const closed: string[] = [];
    const store = memoryStore({ user_1: MEMBER });
    const { message } = await mcpPostAs(handler(fakeGive(store, closed)), call("cancel_membership", { confirmed: true }), "user_1");
    expect(message.result.content[0].text).toMatch(/cancelled/);
    expect(closed).toEqual(["B01-1"]);
    expect(store.saved.user_1.status).toBe("cancelled");
  });

  it("no membership on file (or already cancelled): points to pay.amazon.com, closes nothing", async () => {
    const closed: string[] = [];
    for (const store of [memoryStore(), memoryStore({ user_1: { ...MEMBER, status: "cancelled" } })]) {
      const { message } = await mcpPostAs(handler(fakeGive(store, closed)), call("cancel_membership", { confirmed: true }), "user_1");
      expect(message.result.content[0].text).toContain("pay.amazon.com");
    }
    expect(closed).toEqual([]);
  });

  it("unlinked: account linking; unconfigured: not set up", async () => {
    const unlinked = (await mcpPost(handler(fakeGive()), call("cancel_membership"))).message.result;
    expect(unlinked.structuredContent).toEqual({ error: "account_linking_required" });
    expect(unlinked.content[0].text).toBe("Link your Radio Milwaukee account to manage your membership.");
    expect((await mcpPostAs(handler(null), call("cancel_membership"), "user_1")).message.result.content[0].text).toMatch(/aren't set up yet/);
  });
});

describe("whats_new_for_me membership line", () => {
  it("thanks an active monthly member, with the date they joined", async () => {
    const { message } = await mcpPostAs(handler(fakeGive(memoryStore({ user_1: MEMBER }))), call("whats_new_for_me"), "user_1");
    expect(message.result.content[0].text).toContain("thanks for being a monthly member since October 5");
  });
  it("says nothing for a non-member, a cancelled member, a failing store, or no give setup", async () => {
    const failing: MembershipStore = { get: async () => { throw new Error("clerk down"); }, set: async () => {} };
    for (const give of [fakeGive(memoryStore()), fakeGive(memoryStore({ user_1: { ...MEMBER, status: "cancelled" } })), fakeGive(failing), null]) {
      const { message } = await mcpPostAs(handler(give), call("whats_new_for_me"), "user_1");
      expect(message.result.isError).toBeFalsy();
      expect(message.result.content[0].text).not.toContain("member");
    }
  });
});

describe("my_membership", () => {
  const FRONT_ROW: Membership = {
    ...MEMBER, tierId: "front-row-monthly", amount: "20.00",
    premium: { items: ["RadioMKE t-shirt", "Sticker"], size: "L", shipTo: { city: "Milwaukee", state: "WI" }, status: "sandbox — not shipped" },
  };

  it("is a card tool that needs a linked account, kept apart from giving", async () => {
    expect(AUTH_TOOLS as readonly string[]).toContain("my_membership");
    const { message } = await mcpPost(handler(fakeGive()), { method: "tools/list" });
    const tool = message.result.tools.find((t: { name: string }) => t.name === "my_membership");
    expect(tool._meta.ui.resourceUri).toBe(CARD_URI);
    expect(tool.description).toMatch(/am I a member/i);
    expect(tool.description).toMatch(/support_radio_milwaukee/);
  });

  it("unlinked: the membership linking prompt", async () => {
    const unlinked = (await mcpPost(handler(fakeGive()), call("my_membership"))).message.result;
    expect(unlinked.isError).toBe(true);
    expect(unlinked.structuredContent).toEqual({ error: "account_linking_required" });
    expect(unlinked.content[0].text).toBe(LINK_ACCOUNT_FOR_MEMBERSHIP_SPEECH);
  });

  it("an active member hears level, amount, since, next charge month, gift and perks, and that it's a demo", async () => {
    const { message } = await mcpPostAs(handler(fakeGive(memoryStore({ user_1: FRONT_ROW }))), call("my_membership"), "user_1");
    expect(message.result.isError).toBeFalsy();
    expect(message.result.content[0].text).toBe(
      "You're a Front Row member: $20 a month since October 5. Next charge in November. Your Front Row package, size L, includes a merch package: a t-shirt and a sticker. This is a demo membership — no real money, and nothing ships.",
    );
    const data = message.result.structuredContent;
    expect(data.view).toBe("membership");
    expect(data.member).toBe(true);
  });

  it("without a gift, says what the level includes; VIP names the Studio Milwaukee Sessions invitation", async () => {
    const vip = { ...MEMBER, tierId: "vip-monthly", amount: "42.00" };
    const { message } = await mcpPostAs(handler(fakeGive(memoryStore({ user_1: vip }))), call("my_membership"), "user_1");
    expect(message.result.content[0].text).toBe(
      "You're a VIP member: $42 a month since October 5. Next charge in November. VIP includes a hat, a t-shirt and a sticker, plus an invitation for you and a guest to Studio Milwaukee Sessions. This is a demo membership — no real money.",
    );
  });

  it("not a member: offers to support, never starts checkout; cancelled says so", async () => {
    const none = (await mcpPostAs(handler(fakeGive(memoryStore())), call("my_membership"), "user_1")).message.result;
    expect(none.content[0].text).toBe("You're not a member yet. Want to support Radio Milwaukee?");
    expect(none.structuredContent).toEqual({ member: false });
    const cancelled = (await mcpPostAs(handler(fakeGive(memoryStore({ user_1: { ...MEMBER, status: "cancelled" } }))), call("my_membership"), "user_1")).message.result;
    expect(cancelled.content[0].text).toBe("Your monthly membership is cancelled, so you're not a member right now. Want to support Radio Milwaukee again?");
  });

  it("a failing store apologizes; no give setup says not set up", async () => {
    const failing: MembershipStore = { get: async () => { throw new Error("clerk down"); }, set: async () => {} };
    const failed = (await mcpPostAs(handler(fakeGive(failing)), call("my_membership"), "user_1")).message.result;
    expect(failed.isError).toBe(true);
    expect(failed.content[0].text).toMatch(/can't check your membership/);
    expect((await mcpPostAs(handler(null), call("my_membership"), "user_1")).message.result.content[0].text).toMatch(/aren't set up yet/);
  });

  it("the card shows the facts and asks to upgrade or cancel; VIP has no upgrade", () => {
    const html = renderView({ view: "membership", level: "Front Row", amount: "$20/mo", since: "October 5", nextCharge: "November 2026", gift: "Front Row package, size L", perks: "a merch package: a t-shirt and a sticker", upgradeTo: "VIP" });
    for (const text of ["Front Row", "$20/mo", "October 5", "November 2026", "Front Row package, size L", "a merch package: a t-shirt and a sticker", "DEMO · Amazon Pay sandbox · no real money"]) expect(html).toContain(text);
    expect(html).toContain('data-ask="Upgrade me to VIP"');
    expect(html).toContain('data-ask="Cancel my Radio Milwaukee membership"');
    const vip = renderView({ view: "membership", level: "VIP", amount: "$42/mo", since: "October 5", nextCharge: null, gift: null, perks: "x", upgradeTo: null });
    expect(vip).not.toContain("Upgrade");
  });
});

describe("support_radio_milwaukee with a level (upgrade)", () => {
  it("opens the give card on that level and says its price and gift, as a demo", async () => {
    const { message } = await mcpPostAs(handler(fakeGive()), call("support_radio_milwaukee", { level: "front-row" }), "user_1");
    expect(message.result.content[0].text).toBe("Here's Front Row: $20 a month, with a merch package: a t-shirt and a sticker. Pick your size and I'll open a secure Amazon Pay page. This is a demo, so no real money moves.");
    const data = message.result.structuredContent;
    expect(data.view).toBe("give");
    expect(data.selected).toBe("front-row-monthly");
    expect(data.cardHtml).toMatch(/class="primary details give-tier" data-url="[^"]*tier=front-row-monthly/);
    expect(Object.keys(data.links)).toHaveLength(8);
  });

  it("a one-time level preselects the one-time tab; a level without a size skips the size", async () => {
    const once = (await mcpPost(handler(fakeGive()), call("support_radio_milwaukee", { level: "ga", kind: "once" }))).message.result;
    expect(once.content[0].text).toBe("Here's General Admission: $60 one time, with the Green Room newsletter. I'll open a secure Amazon Pay page. This is a demo, so no real money moves.");
    expect(once.structuredContent.selected).toBe("ga-once");
    expect(once.structuredContent.cardHtml).toContain('id="give-once" checked');
  });
});
