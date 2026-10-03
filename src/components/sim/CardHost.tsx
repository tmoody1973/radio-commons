"use client";

import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useRef, useState } from "react";
import { isMapsLink } from "@/lib/maps";
import styles from "./simulator.module.css";

export interface CardPayload {
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

let cardPage: Promise<string> | null = null;
// Every answer is a new card: an MCP App initializes once, so a follow-up about the same story must remount it.
const cardIds = new WeakMap<CardPayload, number>();
let nextCardId = 0;
const cardKey = (card: CardPayload) => {
  if (!cardIds.has(card)) cardIds.set(card, nextCardId++);
  return String(cardIds.get(card));
};
const loadCardPage = () => (cardPage ??= fetch("/api/sim/card").then((r) => (r.ok ? r.text() : Promise.reject(new Error(`card ${r.status}`)))));

/**
 * The simulator as an MCP Apps host: the story card from our MCP server runs in a sandboxed iframe, and the
 * official AppBridge hands it the tool input and result, as Alexa+ would on an Echo Show.
 */
export function CardHost({ card, onPlaying }: { card: CardPayload; onPlaying: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadCardPage().then(setHtml, () => setFailed(true));
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "radio-commons:playing") onPlaying();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onPlaying]);

  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!html || !win) return;
    const bridge = new AppBridge(null, { name: "radio-commons-simulator", version: "0.1.0" }, { openLinks: {} });
    // The card asks; the host decides. This host opens Google Maps directions only; a device would hand them to its own maps.
    bridge.onopenlink = async ({ url }) => {
      if (!isMapsLink(url)) return { isError: true };
      window.open(url, "_blank", "noopener,noreferrer");
      return {};
    };
    bridge.oninitialized = () => {
      void bridge.sendToolInput({ arguments: card.input });
      void bridge.sendToolResult(card.result as never);
    };
    void bridge.connect(new PostMessageTransport(win, win));
    return () => {
      void bridge.close();
    };
  }, [html, card]);

  if (failed) return <p className={styles.idle}>The story card couldn&rsquo;t load.</p>;
  if (!html) return <p className={styles.idle}>Loading the story…</p>;
  return <iframe key={cardKey(card)} ref={frame} className={styles.card} sandbox="allow-scripts" srcDoc={html} title="Story card" />;
}
