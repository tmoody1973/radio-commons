import { describe, expect, it } from "vitest";
import { AUTH_TOOLS } from "@/lib/listenerAuth";
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
