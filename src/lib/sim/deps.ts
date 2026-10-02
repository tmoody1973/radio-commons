import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient } from "@aws-sdk/client-polly";
import { bedrockConverse } from "@/lib/sim/brain";
import { connectMcp } from "@/lib/sim/mcpClient";
import { deepgramTranscribe } from "@/lib/sim/stt";
import type { McpSession } from "@/lib/sim/mcpClient";
import type { SpeakDeps } from "@/lib/sim/speak";
import { pollyStream } from "@/lib/sim/tts";
import type { TurnDeps } from "@/lib/sim/turn";

const HAIKU = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
export const mcpUrl = () => process.env.MCP_URL ?? "https://radio-commons.vercel.app/api/mcp";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let shared: Promise<McpSession> | null = null;
/** One MCP connection per server instance (saves ~0.5–0.9 s a turn); a failed connect is retried next turn. */
function sharedMcp(): Promise<McpSession> {
  shared ??= connectMcp(mcpUrl()).catch((error) => {
    shared = null;
    throw error;
  });
  return shared;
}

const awsConfig = () => ({
  region: process.env.SIM_AWS_REGION ?? "us-east-1",
  credentials: { accessKeyId: required("SIM_AWS_ACCESS_KEY_ID"), secretAccessKey: required("SIM_AWS_SECRET_ACCESS_KEY") },
});

/** The real services, from server-only env vars. */
export function turnDepsFromEnv(): TurnDeps {
  return {
    passcode: required("SIM_PASSCODE"),
    transcribe: deepgramTranscribe(required("DEEPGRAM_API_KEY")),
    mcp: sharedMcp,
    converse: bedrockConverse(new BedrockRuntimeClient(awsConfig()), HAIKU),
  };
}

export function speakDepsFromEnv(): SpeakDeps {
  return { secret: required("SIM_PASSCODE"), synthesize: pollyStream(new PollyClient(awsConfig()), process.env.SIM_POLLY_VOICE ?? "Ruth") };
}
