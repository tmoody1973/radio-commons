import { NextResponse } from "next/server";
import { cookieOptions, SESSION_COOKIE } from "@/lib/sim/session";

export const preferredRegion = "iad1";

/** Forgets the linked account on this browser (the tokens lived only in its sealed cookie). */
export function POST() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions("/", 0));
  return response;
}
