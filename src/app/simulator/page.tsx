import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { cookies } from "next/headers";
import { Simulator } from "@/components/sim/Simulator";
import { renderView } from "@/lib/card";
import { openSession, SESSION_COOKIE, sessionSecret } from "@/lib/sim/session";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Radio Commons — Alexa+ simulator",
  description: "A simulated Alexa+ on an Echo Show, using the real Radio Commons MCP tools.",
};

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<{ link?: string | string[] }> }) {
  const sealed = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = sessionSecret();
  const linked = Boolean(sealed && secret && openSession(sealed, secret));
  const { link } = await searchParams;
  const linkOutcome = link === "ok" || link === "failed" ? link : undefined;
  // The start screen is the same card Alexa+ shows for "What can Radio Milwaukee do?".
  const introCard = { input: {}, result: { structuredContent: { view: "capabilities", cardHtml: renderView({ view: "capabilities" }) } } };
  return <div className={figtree.className}><Simulator linked={linked} linkOutcome={linkOutcome} introCard={introCard} /></div>;
}
