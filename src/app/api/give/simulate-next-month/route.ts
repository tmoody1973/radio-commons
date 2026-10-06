import { giveFromEnv, type Give } from "@/lib/give";
import { chargeNextPeriod, SANDBOX } from "@/lib/give/amazonPay";
import { isPeriod, nextPeriod, periodName } from "@/lib/give/membership";
import { openListener } from "@/lib/give/token";

// The Amazon Pay SDK signs with node:crypto.
export const runtime = "nodejs";

// The month the button offers next, with its name, so the page needs no date code of its own.
const after = (period: string) => ({ next: nextPeriod(period), nextLabel: periodName(nextPeriod(period)) });

interface SimulateRequest { give: Give | null; body: unknown; now: number }

/**
 * Sandbox only: charge the next month now, standing in for a scheduler. The button names the month, so a double click
 * asks for the same month twice: the second sees it already charged, and a race between them shares one idempotency key.
 */
export async function handleSimulate({ give, body, now }: SimulateRequest): Promise<Response> {
  if (!SANDBOX || !give?.memberships) return Response.json({ error: "not_set_up" }, { status: 503 });
  const { t, period } = (body ?? {}) as { t?: unknown; period?: unknown };
  const listenerId = typeof t === "string" ? openListener(t, give.tokenSecret, now) : null;
  if (!listenerId) return Response.json({ error: "link_expired" }, { status: 401 });
  if (!isPeriod(period)) return Response.json({ error: "bad_period" }, { status: 400 });
  const membership = await give.memberships.get(listenerId);
  if (membership?.status !== "active") return Response.json({ error: "no_membership" }, { status: 404 });
  const last = membership.lastChargedPeriod;
  if (period <= last) return Response.json({ status: "already", period, label: periodName(period), ...after(last) });
  if (period !== nextPeriod(last)) return Response.json({ error: "not_next_month" }, { status: 409 });
  const charged = await chargeNextPeriod(await give.pay(), membership, period);
  if (charged.status === "declined") return Response.json({ status: "declined" }, { status: 402 });
  await give.memberships.set(listenerId, { ...membership, lastChargedPeriod: period });
  return Response.json({ status: "charged", period, label: periodName(period), amount: membership.amount, reference: charged.reference, ...after(period) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    return await handleSimulate({ give: giveFromEnv(), body, now: Date.now() });
  } catch {
    console.error(JSON.stringify({ event: "simulate_failed" })); // Clerk unreachable; Amazon errors are handled inside
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
