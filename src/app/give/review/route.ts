import { NextResponse, type NextRequest } from "next/server";
import { giveFromEnv } from "@/lib/give";
import { returnOrigin } from "@/lib/give/amazonPay";
import { reviewRedirect } from "@/lib/give/checkout";

// Amazon's checkoutReviewReturnUrl for a shipped gift. No page: set the amount, then straight back to Amazon to confirm.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = await reviewRedirect({
    give: giveFromEnv(), tierId: params.get("tier") ?? undefined, gift: params.get("g"), token: params.get("t"),
    sessionId: params.get("amazonCheckoutSessionId"), origin: returnOrigin(request.headers), now: Date.now(),
  });
  return NextResponse.redirect(target, 303);
}
