"use client";

import styles from "./simulator.module.css";

export interface CardPayload {
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

// Replaced in Task 5 by the MCP Apps host (AppBridge + sandboxed iframe).
export function CardHost({ card }: { card: CardPayload | null; onPlaying: () => void }) {
  return card ? <div className={styles.card} /> : null;
}
