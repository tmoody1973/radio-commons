import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk runs only on the listener connect flow; the MCP route, simulator and .well-known stay untouched.
export default clerkMiddleware();

export const config = {
  matcher: ["/connect/:path*", "/api/connect/:path*"],
};
