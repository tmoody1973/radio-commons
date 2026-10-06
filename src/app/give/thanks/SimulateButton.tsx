"use client";

import { useState } from "react";

interface Reply { status?: string; label?: string; amount?: string; reference?: string; next?: string; nextLabel?: string; error?: string }

const describe = (reply: Reply): string => {
  if (reply.status === "charged") return `Charged $${reply.amount} for ${reply.label} (simulated). Amazon Pay reference ${reply.reference}.`;
  if (reply.status === "already") return `${reply.label} is already charged.`;
  if (reply.status === "declined") return "That charge was declined. Nothing was recorded.";
  if (reply.error === "link_expired") return "This page's link has expired. Ask Alexa to support Radio Milwaukee again to get a fresh one.";
  if (reply.error === "no_membership") return "There's no active membership to charge.";
  return "That didn't work. Please try again.";
};

/** Sandbox only: stands in for the monthly scheduler. It asks for one named month, so a double click charges once. */
export function SimulateButton({ token, firstPeriod, firstLabel }: { token: string; firstPeriod: string; firstLabel: string }) {
  const [period, setPeriod] = useState({ id: firstPeriod, label: firstLabel });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function simulate() {
    setBusy(true);
    try {
      const response = await fetch("/api/give/simulate-next-month", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, period: period.id }) });
      const reply = (await response.json().catch(() => ({}))) as Reply;
      setMessage(describe(reply));
      if (reply.next && reply.nextLabel) setPeriod({ id: reply.next, label: reply.nextLabel });
    } catch {
      setMessage("That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={simulate} disabled={busy}>Simulate next month ({period.label})</button>
      <p aria-live="polite">{message}</p>
    </>
  );
}
