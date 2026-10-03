import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Simulator } from "@/components/sim/Simulator";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Radio Commons — Alexa+ simulator",
  description: "A simulated Alexa+ on an Echo Show, using the real Radio Commons MCP tools.",
};

export default function SimulatorPage() {
  return <div className={figtree.className}><Simulator /></div>;
}
