"use client";

import { SignIn, useAuth } from "@clerk/nextjs";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { TOKENS } from "@/lib/card/tokens";

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const THEME_CSS = `
.connect{--screen:${TOKENS.light.screen};--card:${TOKENS.light.card};--text:${TOKENS.light.text};--muted:${TOKENS.light.muted}}
@media (prefers-color-scheme: dark){.connect{--screen:${TOKENS.dark.screen};--card:${TOKENS.dark.card};--text:${TOKENS.dark.text};--muted:${TOKENS.dark.muted}}}`;

type Phase = "loading" | "ready" | "working" | "connected" | "unavailable" | "denied" | "error";

// MusicKit's name for "Apple refused library access": no Apple Music subscription, or the listener chose Don't Allow.
const APPLE_DENIED_ERROR = "AUTHORIZATION_ERROR";

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

async function prepareMusicKit(): Promise<MusicKitGlobal | null> {
  const developerToken = await fetchDeveloperToken();
  if (!developerToken) return null;
  const musicKit = await loadMusicKit();
  await musicKit.configure({ developerToken, app: { name: "Radio Milwaukee", build: "1" } });
  return musicKit;
}

async function linkMusicUserToken(musicUserToken: string): Promise<Phase> {
  const response = await fetch("/api/connect/apple-music", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ musicUserToken }),
  });
  if (response.status === 503) return "unavailable";
  return response.ok ? "connected" : "error";
}

const MESSAGES: Record<"connected" | "unavailable" | "denied" | "error", string> = {
  connected: "Connected. Say \u201csave it\u201d to Alexa after any song.",
  unavailable: "Apple Music isn\u2019t available right now. Please try again later.",
  denied: "Saving to your library needs an Apple Music subscription.",
  error: "We couldn\u2019t connect Apple Music. Please try again.",
};

function ConnectCard() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [configured, setConfigured] = useState(false);
  const musicKit = useRef<MusicKitGlobal | null>(null);

  // Everything async happens here so the click handler can open Apple's popup inside the user's tap.
  useEffect(() => {
    let cancelled = false;
    prepareMusicKit().then(
      (ready) => {
        musicKit.current = ready;
        if (cancelled) return;
        setConfigured(ready !== null);
        setPhase(ready ? "ready" : "unavailable");
      },
      () => { if (!cancelled) setPhase("error"); },
    );
    return () => { cancelled = true; };
  }, []);

  const connect = async () => {
    if (!musicKit.current) return;
    setPhase("working");
    try {
      const musicUserToken = await musicKit.current.getInstance().authorize();
      setPhase(await linkMusicUserToken(musicUserToken));
    } catch (error: unknown) {
      setPhase((error as Error)?.name === APPLE_DENIED_ERROR ? "denied" : "error"); // the cause may carry a token, so it is never logged or shown
    }
  };

  return (
    <>
      <p style={{ color: "var(--muted)" }}>Link Apple Music so songs you save with Alexa land in your library.</p>
      {(phase === "connected" || phase === "unavailable" || phase === "denied" || phase === "error") && <p role="status">{MESSAGES[phase]}</p>}
      {phase !== "connected" && phase !== "unavailable" && (
        <button
          onClick={connect}
          disabled={!configured || phase === "working"}
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
        {/* Hash routing: this page isn't a catch-all route, so Clerk's path-routed steps would 404. */}
        {isLoaded && (isSignedIn ? <ConnectCard /> : <SignIn routing="hash" fallbackRedirectUrl="/connect/apple-music" signUpFallbackRedirectUrl="/connect/apple-music" />)}
        <p style={{ color: "var(--muted)", fontSize: 14 }}><a href="/privacy" style={{ color: "inherit" }}>Privacy</a> · <a href="/terms" style={{ color: "inherit" }}>Terms</a></p>
      </section>
    </main>
  );
}
