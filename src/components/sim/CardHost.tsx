"use client";

import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useRef, useState } from "react";
import { isOpenableLink } from "@/lib/maps";
import styles from "./simulator.module.css";

export interface CardPayload {
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

export type Theme = "light" | "dark";
export type DisplayMode = "inline" | "fullscreen";

let cardPage: Promise<string> | null = null;
const loadCardPage = () =>
  (cardPage ??= fetch("/api/sim/card").then((r) => (r.ok ? r.text() : Promise.reject(new Error(`card ${r.status}`)))).catch((error) => {
    cardPage = null; // a failed load can be retried by the next answer
    throw error;
  }));

// Every answer is a new card: an MCP App initializes once, so a follow-up about the same story must remount it.
const cardIds = new WeakMap<CardPayload, number>();
let nextCardId = 0;
const cardKey = (card: CardPayload) => {
  if (!cardIds.has(card)) cardIds.set(card, nextCardId++);
  return String(cardIds.get(card));
};

interface Props {
  card: CardPayload;
  theme: Theme;
  displayMode: DisplayMode;
  onPlaying: () => void;
  /** The card asked a follow-up ("Tell me about the story …"): run it as the listener's next turn. */
  onAsk: (text: string) => void;
  onDisplayMode: (mode: DisplayMode) => void;
}

/**
 * The simulator as an MCP Apps host: the card from our MCP server runs in a sandboxed iframe, and the official
 * AppBridge hands it the tool result plus what Alexa+ tells a card about its surface: size, theme and display mode.
 */
export function CardHost({ card, theme, displayMode, onPlaying, onAsk, onDisplayMode }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const bridge = useRef<AppBridge | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ onAsk, onDisplayMode, onPlaying, theme, displayMode });
  useEffect(() => {
    latest.current = { onAsk, onDisplayMode, onPlaying, theme, displayMode };
  });

  const context = () => {
    const el = frame.current;
    return {
      theme: latest.current.theme,
      displayMode: latest.current.displayMode,
      availableDisplayModes: ["inline", "fullscreen"] as DisplayMode[],
      containerDimensions: { width: el?.clientWidth ?? 1232, height: el?.clientHeight ?? 560 },
    };
  };

  useEffect(() => {
    loadCardPage().then(setHtml, () => setFailed(true));
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "radio-commons:playing") latest.current.onPlaying();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!html || !win) return;
    const host = new AppBridge(null, { name: "radio-commons-simulator", version: "0.2.0" }, { openLinks: {} }, { hostContext: context() });
    // The card asks; the host decides: maps, calendar and event pages only. A device would use its own apps.
    host.onopenlink = async ({ url }) => {
      if (!isOpenableLink(url)) return { isError: true };
      window.open(url, "_blank", "noopener,noreferrer");
      return {};
    };
    host.onrequestdisplaymode = async ({ mode }) => {
      const next: DisplayMode = mode === "fullscreen" ? "fullscreen" : "inline";
      latest.current.onDisplayMode(next);
      return { mode: next };
    };
    host.onmessage = async ({ content }) => {
      const text = content.find((block) => block.type === "text");
      if (text && "text" in text && typeof text.text === "string") latest.current.onAsk(text.text);
      return {};
    };
    host.oninitialized = () => {
      void host.sendToolInput({ arguments: card.input });
      void host.sendToolResult(card.result as never);
    };
    void host.connect(new PostMessageTransport(win, win));
    bridge.current = host;
    return () => {
      bridge.current = null;
      void host.close();
    };
    // Theme, mode and size after connect go through setHostContext below; this effect runs per card.
  }, [html, card]);

  // Theme, fullscreen and size changes reach the card as host-context updates, with no reload.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const update = () => bridge.current?.setHostContext(context());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [theme, displayMode, html]);

  if (failed) return <p className={styles.idle}>The card couldn&rsquo;t load.</p>;
  if (!html) return <p className={styles.idle}>Loading…</p>;
  return <iframe key={cardKey(card)} ref={frame} className={styles.card} sandbox="allow-scripts" srcDoc={html} title="Story card" />;
}
