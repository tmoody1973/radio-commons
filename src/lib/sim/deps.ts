import { createHash } from "node:crypto";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient } from "@aws-sdk/client-polly";
import { bedrockConverse } from "@/lib/sim/brain";
import { connectMcp } from "@/lib/sim/mcpClient";
import { sessionSecret } from "@/lib/sim/session";
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

const MAX_LINKED_CONNECTIONS = 20;
// Keyed by the token's hash so the raw token never sits in a map key; a refreshed token gets a new connection.
const linked = new Map<string, Promise<McpSession>>();
/** One connection per linked listener token, at most 20 (oldest evicted); a failed connect is retried next turn. */
function perTokenMcp(accessToken: string): Promise<McpSession> {
  const key = createHash("sha256").update(accessToken).digest("hex");
  const cached = linked.get(key);
  if (cached) return cached;
  if (linked.size >= MAX_LINKED_CONNECTIONS) {
    const [oldestKey, oldest] = linked.entries().next().value!;
    linked.delete(oldestKey);
    void oldest.then((session) => session.close()).catch(() => undefined);
  }
  const connecting = connectMcp(mcpUrl(), { bearer: accessToken }).catch((error) => {
    linked.delete(key);
    throw error;
  });
  linked.set(key, connecting);
  return connecting;
}

const awsConfig = () => ({
  region: process.env.SIM_AWS_REGION ?? "us-east-1",
  credentials: { accessKeyId: required("SIM_AWS_ACCESS_KEY_ID"), secretAccessKey: required("SIM_AWS_SECRET_ACCESS_KEY") },
});

/** Speech links are signed with a key derived from the AWS secret (high-entropy), never the human-shared passcode. */
const speechSecret = () => createHash("sha256").update(`radio-commons-speech:${required("SIM_AWS_SECRET_ACCESS_KEY")}`).digest("hex");

// One client each per server instance, so keep-alive connections are reused across turns.
let bedrock: BedrockRuntimeClient | undefined;
let polly: PollyClient | undefined;

/** The real services, from server-only env vars. */
export function turnDepsFromEnv(): TurnDeps {
  bedrock ??= new BedrockRuntimeClient(awsConfig());
  return {
    passcode: required("SIM_PASSCODE"),
    speechSecret: speechSecret(),
    transcribe: deepgramTranscribe(required("DEEPGRAM_API_KEY")),
    mcp: (accessToken) => (accessToken ? perTokenMcp(accessToken) : sharedMcp()),
    converse: bedrockConverse(bedrock, HAIKU),
  };
}

export function speakDepsFromEnv(): SpeakDeps {
  polly ??= new PollyClient(awsConfig());
  return { secret: speechSecret(), synthesize: pollyStream(polly, process.env.SIM_POLLY_VOICE ?? "Ruth") };
}

/** Account linking settings; null (linking off) unless every one is set, including a usable session secret. */
export function linkConfigFromEnv() {
  const { CLERK_LISTENER_OAUTH_CLIENT_ID: clientId, CLERK_LISTENER_OAUTH_CLIENT_SECRET: clientSecret, SIM_PUBLIC_ORIGIN: origin } = process.env;
  const secret = sessionSecret();
  if (!clientId || !clientSecret || !origin || !secret) return null;
  return { clientId, clientSecret, secret, redirectUri: `${origin.replace(/\/$/, "")}/api/sim/link/callback` };
}
