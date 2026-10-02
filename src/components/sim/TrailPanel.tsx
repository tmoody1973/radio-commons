"use client";

import type { TrailEntry } from "@/lib/sim/trail";
import { trailLabel } from "@/lib/sim/ui";
import styles from "./simulator.module.css";

/** "What Alexa did": the words heard, each MCP tool call with its time, and where the answer came from. */
export function TrailPanel({ turns }: { turns: TrailEntry[][] }) {
  return (
    <aside className={styles.trail} aria-label="What Alexa did">
      <h2>What Alexa did</h2>
      {turns.length === 0 ? <p>Nothing yet. Ask something.</p> : null}
      {turns.map((trail, i) => (
        <section key={i}>
          <h3>Turn {i + 1}</h3>
          <ol>
            {trail.map((entry, j) => <li key={j}>{trailLabel(entry)}</li>)}
          </ol>
        </section>
      ))}
    </aside>
  );
}
