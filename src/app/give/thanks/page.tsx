import { notFound } from "next/navigation";
import { giveFromEnv } from "@/lib/give";
import { finishCheckout, type ThanksResult } from "@/lib/give/checkout";
import { periodName } from "@/lib/give/membership";
import { SimulateButton } from "./SimulateButton";

// Completes a payment: per request, on Node (the Amazon Pay SDK signs with node:crypto).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const longDate = (ms: number) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(ms);

// Outside the component: completing a payment is a side effect, and "now" is the moment it happened.
async function finish(tierId: string | undefined, token: string | undefined, sessionId: string | undefined) {
  const now = Date.now();
  return { now, result: await finishCheckout({ give: giveFromEnv(), tierId, token, sessionId, now }) };
}

export default async function ThanksPage({ searchParams }: PageProps<"/give/thanks">) {
  const params = await searchParams;
  const token = one(params.t);
  const { result, now } = await finish(one(params.tier), token, one(params.amazonCheckoutSessionId));
  if (result.kind === "not_found") notFound();
  if (result.kind === "not_set_up") return <h1>Donations aren&rsquo;t set up yet</h1>;
  if (result.kind === "failed") {
    const retry = `/give?tier=${result.tier.id}${token ? `&t=${encodeURIComponent(token)}` : ""}`;
    return (
      <>
        <h1>That didn&rsquo;t go through</h1>
        <p>Nothing was charged. <a href={retry}>Try again</a>.</p>
      </>
    );
  }
  return <Receipt result={result} token={token} now={now} />;
}

function Receipt({ result, token, now }: { result: Extract<ThanksResult, { kind: "paid" | "pending" }>; token: string | undefined; now: number }) {
  const { tier, reference, recorded } = result;
  const monthly = tier.kind === "monthly";
  return (
    <>
      <h1>{result.kind === "pending" ? "Processing your gift" : monthly ? "Thank you. You're a monthly member (demo)." : "Thank you for your gift (demo)."}</h1>
      {result.kind === "pending" && <p>Amazon Pay is still confirming it. Check back in a minute.</p>}
      <p className="receipt">{`$${tier.amount}`}{monthly ? " a month" : ""} · {longDate(now)} · Amazon Pay reference {reference}</p>
      {monthly && recorded && <p>To cancel, say: &ldquo;Alexa, cancel my Radio Milwaukee membership.&rdquo; Or cancel at pay.amazon.com.</p>}
      {monthly && recorded === false && <p>We couldn&rsquo;t save this to your Radio Milwaukee account, so cancelling by voice won&rsquo;t work. Cancel any time at pay.amazon.com.</p>}
      {monthly && recorded === null && <p>Cancel any time at pay.amazon.com. Link your Radio Milwaukee account in Alexa next time to cancel by voice.</p>}
      {monthly && recorded && token && result.kind === "paid" && (
        <SimulateButton token={token} firstPeriod={result.nextPeriod} firstLabel={periodName(result.nextPeriod)} />
      )}
    </>
  );
}
