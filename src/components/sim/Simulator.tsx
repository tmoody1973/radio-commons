"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, TrailEntry } from "@/lib/sim/trail";
import { nextHistory } from "@/lib/sim/ui";
import { CardHost, type CardPayload } from "./CardHost";
import styles from "./simulator.module.css";
import { TrailPanel } from "./TrailPanel";

type Phase = "idle" | "listening" | "thinking" | "answering";
interface TurnResponse { heard: string; reply: string; speech: string; card: CardPayload | null; trail: TrailEntry[] }

const PASSCODE_KEY = "radio-commons-sim-passcode";
const MAX_RECORD_MS = 15_000;
const EXAMPLES = [
  "What was that This Bites episode about frugal dining?",
  "What was that Uniquely Milwaukee story about the art shop in West Allis?",
];

function readPasscode(): string {
  try {
    return sessionStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function Simulator() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [captions, setCaptions] = useState("");
  const [status, setStatus] = useState("");
  const [card, setCard] = useState<CardPayload | null>(null);
  const [turns, setTurns] = useState<TrailEntry[][]>([]);
  const [showTrail, setShowTrail] = useState(false);
  const [typed, setTyped] = useState("");
  const history = useRef<ChatMessage[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const voice = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false); // is the talk button (or Space) still down?
  const starting = useRef(false); // waiting for the microphone
  const busy = useRef(false); // a turn is being answered
  useEffect(() => {
    busy.current = phase === "thinking";
  }, [phase]);

  // Wake the MCP server so a cold start doesn't land on the first question.
  useEffect(() => {
    void fetch("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "simulator-warmup", version: "1" } } }),
    }).catch(() => undefined);
  }, []);

  const send = useCallback(async (form: FormData) => {
    let passcode = readPasscode();
    if (!passcode) {
      passcode = window.prompt("Simulator passcode") ?? "";
      try { sessionStorage.setItem(PASSCODE_KEY, passcode); } catch { /* private mode: ask again next time */ }
    }
    form.set("history", JSON.stringify(history.current));
    setPhase("thinking");
    setStatus("");
    try {
      const response = await fetch("/api/sim/turn", { method: "POST", headers: { "x-sim-passcode": passcode }, body: form });
      const body = (await response.json()) as TurnResponse | { error: string };
      if (!response.ok || "error" in body) {
        if (response.status === 401) { try { sessionStorage.removeItem(PASSCODE_KEY); } catch { /* ignore */ } }
        setStatus("error" in body ? body.error : `Error ${response.status}`);
        setPhase("idle");
        return;
      }
      const shown = body.card?.result.structuredContent as { story?: { storyId: string; title: string } } | undefined;
      history.current = nextHistory(history.current, body.heard, body.reply, shown?.story);
      setTurns((all) => [...all, body.trail]);
      setCaptions(body.reply);
      if (body.card) setCard(body.card);
      setPhase("answering");
      if (voice.current) {
        // Streams as Polly speaks, so the answer starts before the whole reply is voiced.
        voice.current.src = `/api/sim/speak?t=${encodeURIComponent(body.speech)}`;
        void voice.current.play().catch(() => setStatus("Tap anywhere to allow sound, then ask again."));
      }
    } catch {
      setStatus("Couldn't reach the simulator. Check your connection.");
      setPhase("idle");
    }
  }, []);

  const startTalking = useCallback(async () => {
    held.current = true;
    if (recorder.current || starting.current || busy.current) return;
    starting.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      starting.current = false;
      // Released while the microphone was starting (a quick tap, or answering the permission prompt): don't record.
      if (!held.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        recorder.current = null;
        if (blob.size < 2000) { setPhase("idle"); setStatus("That was too short. Hold the button while you talk."); return; }
        const form = new FormData();
        form.set("audio", blob, "question.webm");
        void send(form);
      };
      voice.current?.pause();
      rec.start();
      recorder.current = rec;
      setPhase("listening");
      stopTimer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORD_MS);
    } catch {
      starting.current = false;
      setStatus("Microphone not available. Use the box to type your question.");
    }
  }, [send]);

  const stopTalking = useCallback(() => {
    held.current = false;
    clearTimeout(stopTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  // Space bar is push-to-talk when focus isn't in the text box.
  useEffect(() => {
    // Space belongs to whatever has focus when that's a control; push-to-talk only from the page itself.
    const isTyping = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      return !!target && (["INPUT", "TEXTAREA", "BUTTON", "A", "SELECT"].includes(target.tagName) || target.isContentEditable);
    };
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !isTyping(e)) { e.preventDefault(); void startTalking(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && !isTyping(e)) { e.preventDefault(); stopTalking(); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [startTalking, stopTalking]);

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const text = typed.trim().slice(0, 300);
    if (!text) return;
    const form = new FormData();
    form.set("text", text);
    setTyped("");
    void send(form);
  };

  const lightbar = phase === "listening" ? styles.listening : phase === "thinking" ? styles.thinking : "";
  return (
    <main className={styles.page}>
      <div className={styles.stage}>
        <div>
          <div className={styles.device} role="region" aria-label="Simulated Echo Show">
            <div className={styles.screen}>
              {card ? (
                <CardHost card={card} onPlaying={() => voice.current?.pause()} />
              ) : (
                <div className={styles.idle}>
                  <h1>Radio Commons</h1>
                  <p>Ask about a Radio Milwaukee story you half-remember.</p>
                  {EXAMPLES.map((e) => <p key={e} className={styles.prompt}>Try: “{e}”</p>)}
                </div>
              )}
              <p className={styles.captions} aria-live="polite">{captions}</p>
              <div className={`${styles.lightbar} ${lightbar}`} aria-hidden="true" />
            </div>
          </div>
          <div className={styles.controls}>
            <button
              type="button" className={styles.talk} aria-pressed={phase === "listening"} disabled={phase === "thinking"}
              onPointerDown={() => void startTalking()} onPointerUp={stopTalking} onPointerLeave={stopTalking} onPointerCancel={stopTalking}
            >
              {phase === "listening" ? "Listening… release to send" : phase === "thinking" ? "Thinking…" : "Hold to talk (or Space)"}
            </button>
            <form className={styles.ask} onSubmit={ask}>
              <input aria-label="Or type a question" placeholder="Or type a question" value={typed} maxLength={300} onChange={(e) => setTyped(e.target.value)} />
              <button type="submit" disabled={phase === "thinking"}>Ask</button>
            </form>
            <button type="button" className={styles.toggle} aria-expanded={showTrail} onClick={() => setShowTrail((s) => !s)}>
              {showTrail ? "Hide" : "Show"} what Alexa did
            </button>
          </div>
          <p className={styles.status} role="status">{status}</p>
        </div>
        {showTrail ? <TrailPanel turns={turns} /> : null}
      </div>
      <audio
        ref={voice}
        onEnded={() => setPhase((p) => (p === "answering" ? "idle" : p))}
        onError={() => setStatus("Voice unavailable; showing captions.")}
        hidden
      />
    </main>
  );
}
