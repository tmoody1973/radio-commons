import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient } from "@aws-sdk/client-polly";
import { bedrockConverse } from "@/lib/sim/brain";
import { connectMcp } from "@/lib/sim/mcpClient";
import { deepgramTranscribe } from "@/lib/sim/stt";
import { pollySpeak } from "@/lib/sim/tts";
import type { TurnDeps } from "@/lib/sim/turn";

const HAIKU = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
export const mcpUrl = () => process.env.MCP_URL ?? "https://radio-commons.vercel.app/api/mcp";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The real services, from server-only env vars. */
export function turnDepsFromEnv(): TurnDeps {
  const aws = {
    region: process.env.SIM_AWS_REGION ?? "us-east-1",
    credentials: { accessKeyId: required("SIM_AWS_ACCESS_KEY_ID"), secretAccessKey: required("SIM_AWS_SECRET_ACCESS_KEY") },
  };
  return {
    passcode: required("SIM_PASSCODE"),
    transcribe: deepgramTranscribe(required("DEEPGRAM_API_KEY")),
    mcp: () => connectMcp(mcpUrl()),
    converse: bedrockConverse(new BedrockRuntimeClient(aws), HAIKU),
    speak: pollySpeak(new PollyClient(aws), process.env.SIM_POLLY_VOICE ?? "Ruth"),
  };
}
