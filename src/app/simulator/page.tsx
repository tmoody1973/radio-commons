import type { Metadata } from "next";
import { Simulator } from "@/components/sim/Simulator";

export const metadata: Metadata = {
  title: "Radio Commons — Alexa+ simulator",
  description: "A simulated Alexa+ on an Echo Show, using the real Radio Commons MCP tools.",
};

export default function SimulatorPage() {
  return <Simulator />;
}
