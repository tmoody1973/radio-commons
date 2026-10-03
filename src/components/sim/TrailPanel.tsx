"use client";

import type { TrailEntry } from "@/lib/sim/trail";
import { trailLabel } from "@/lib/sim/ui";
import styles from "./simulator.module.css";

const dot = (entry: TrailEntry) =>
  entry.kind === "tool" ? (entry.isError ? styles.dotError : styles.dotTool)
    : entry.kind === "reply" ? styles.dotDone
      : entry.kind === "error" ? styles.dotError
        : "";

/** "What Alexa did": the words heard, each MCP tool call with its time, and where the answer came from. Newest turn first. */
export function TrailPanel({ turns }: { turns: TrailEntry[][] }) {
  return (
    <aside className={styles.trail} aria-label="What Alexa did">
      <h2>What Alexa did</h2>
      {turns.length === 0 ? <p>Nothing yet. Ask something.</p> : null}
      {turns.map((trail, i) => ({ trail, n: i + 1 })).reverse().map(({ trail, n }) => (
        <section key={n}>
          <h3>Turn {n}</h3>
          <ol>
            {trail.map((entry, j) => (
              <li key={j}><span className={`${styles.dot} ${dot(entry)}`} aria-hidden="true" />{trailLabel(entry)}</li>
            ))}
          </ol>
        </section>
      ))}
      <p className={styles.trailNote}>Every answer comes from Radio Milwaukee&rsquo;s published record. Nothing an editor removed is ever said.</p>
    </aside>
  );
}
