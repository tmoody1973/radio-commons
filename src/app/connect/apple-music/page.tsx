"use client";

import { SignIn, useAuth } from "@clerk/nextjs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { useCallback, useState } from "react";
import { TOKENS } from "@/lib/card/tokens";

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const THEME_CSS = `
.connect{--screen:${TOKENS.light.screen};--card:${TOKENS.light.card};--text:${TOKENS.light.text};--muted:${TOKENS.light.muted}}
@media (prefers-color-scheme: dark){.connect{--screen:${TOKENS.dark.screen};--card:${TOKENS.dark.card};--text:${TOKENS.dark.text};--muted:${TOKENS.dark.muted}}}`;

type Phase = "idle" | "working" | "connected" | "unavailable" | "error";

interface MusicKitInstance { authorize(): Promise<string> }
interface MusicKitGlobal {
  configure(config: { developerToken: string; app: { name: string; build: string } }): Promise<unknown>;
  getInstance(): MusicKitInstance;
}
declare global { interface Window { MusicKit?: MusicKitGlobal } }

function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MUSICKIT_SRC;
    script.async = true;
    script.onload = () => (window.MusicKit ? resolve(window.MusicKit) : reject(new Error("MusicKit missing")));
    script.onerror = () => reject(new Error("MusicKit failed to load"));
    document.head.appendChild(script);
  });
}

async function fetchDeveloperToken(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_PLAYLIST_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_PLAYLIST_CONVEX_URL is not set");
  const result = await new ConvexHttpClient(url).query(makeFunctionReference<"query">("appleMusic:getDeveloperToken"), {}) as { token: string } | null;
  return result?.token ?? null;
}

async function authorizeAndLink(): Promise<Phase> {
  const developerToken = await fetchDeveloperToken();
  if (!developerToken) return "unavailable";
  const musicKit = await loadMusicKit();
  await musicKit.configure({ developerToken, app: { name: "Radio Milwaukee", build: "1" } });
  const musicUserToken = await musicKit.getInstance().authorize();
  const response = await fetch("/api/connect/apple-music", { method: "POST", body: JSON.stringify({ musicUserToken }) });
  return response.ok ? "connected" : "error";
}

const MESSAGES: Record<Exclude<Phase, "idle" | "working">, string> = {
  connected: "Connected. Say “save it” to Alexa after any song.",
  unavailable: "Apple Music isn’t available right now. Please try again later.",
  error: "We couldn’t connect Apple Music. Please try again.",
};

function ConnectCard() {
  const [phase, setPhase] = useState<Phase>("idle");
  const connect = useCallback(async () => {
    setPhase("working");
    try {
      setPhase(await authorizeAndLink());
    } catch {
      setPhase("error"); // the cause may carry a token, so it is never logged or shown
    }
  }, []);

  return (
    <>
      <p style={{ color: "var(--muted)" }}>Link Apple Music so songs you save with Alexa land in your library.</p>
      {phase !== "idle" && phase !== "working" && <p role="status">{MESSAGES[phase]}</p>}
      {phase !== "connected" && (
        <button
          onClick={connect}
          disabled={phase === "working"}
          style={{ background: TOKENS.accent, color: TOKENS.onAccent, border: 0, borderRadius: 999, padding: "12px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}
        >
          {phase === "working" ? "Connecting…" : "Connect Apple Music"}
        </button>
      )}
    </>
  );
}

export default function ConnectAppleMusicPage() {
  const { isLoaded, isSignedIn } = useAuth();
  return (
    <main className="connect" style={{ background: "var(--screen)", color: "var(--text)", minHeight: "100vh", padding: "48px 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <style>{THEME_CSS}</style>
      <section style={{ maxWidth: 480, margin: "0 auto", background: "var(--card)", borderRadius: 24, padding: 24 }}>
        <h1>Connect Apple Music</h1>
        {isLoaded && (isSignedIn ? <ConnectCard /> : <SignIn />)}
        <p style={{ color: "var(--muted)", fontSize: 14 }}><a href="/privacy" style={{ color: "inherit" }}>Privacy</a></p>
      </section>
    </main>
  );
}
