import { ClerkProvider } from "@clerk/nextjs";

// Rendered per request: Clerk's keys are runtime env, so this must not be prerendered at build time.
export const dynamic = "force-dynamic";

export default function ConnectLayout({ children }: LayoutProps<"/connect">) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
