/**
 * Radio Milwaukee's membership levels (radiomilwaukee.org/donate, read 2026-10-05). The card shows these four (their gifts: premiums.ts); Backstage
 * and up are "More levels on radiomilwaukee.org". The server only ever charges an amount from this list.
 */
export type GiveKind = "monthly" | "once";

export interface Level { slug: string; name: string; monthly: string; once: string }
export interface Tier { id: string; slug: string; level: string; kind: GiveKind; amount: string }

export const LEVELS: readonly Level[] = [
  { slug: "ga", name: "General Admission", monthly: "5.00", once: "60.00" },
  { slug: "main-floor", name: "Main Floor", monthly: "10.00", once: "120.00" },
  { slug: "front-row", name: "Front Row", monthly: "20.00", once: "240.00" },
  { slug: "vip", name: "VIP", monthly: "42.00", once: "500.00" },
];

export const TIERS: readonly Tier[] = LEVELS.flatMap((level) => (["monthly", "once"] as const).map((kind) => ({
  id: `${level.slug}-${kind}`, slug: level.slug, level: level.name, kind, amount: level[kind],
})));

const BY_ID = new Map(TIERS.map((tier) => [tier.id, tier]));

export const tierById = (id: string | undefined | null): Tier | undefined => (id ? BY_ID.get(id) : undefined);

/** "10.00" → "$10", "10.50" → "$10.50". */
export const dollars = (amount: string) => `$${amount.endsWith(".00") ? amount.slice(0, -3) : amount}`;

/** "$10 a month" or "$120 one time". */
export const tierLabel = (tier: Tier) => `${dollars(tier.amount)} ${tier.kind === "monthly" ? "a month" : "one time"}`;
