"use client";

import { useState } from "react";

/** Copies one value; when the browser refuses (no clipboard permission), says so and the listener selects it by hand. */
export function CopyButton({ value }: { value: string }) {
  const [label, setLabel] = useState("Copy");
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => setLabel("Copied ✓"),
      () => setLabel("Select it and copy"),
    );
  return (
    <button type="button" onClick={copy} style={{ marginLeft: 8, padding: "4px 12px", borderRadius: 9999, border: "1px solid #ccc", background: "transparent", cursor: "pointer", font: "inherit" }}>
      {label}
    </button>
  );
}
