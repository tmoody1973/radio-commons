import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { OAUTH_SCOPES } from "@/lib/listenerAuth";
import { CHAT_RESOURCE_PATH } from "@/lib/mcp";

// RFC 9728 path form: the metadata for /api/chatgpt/mcp lives at /.well-known/oauth-protected-resource/api/chatgpt/mcp.
function handler(req: Request): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: process.env.CLERK_LISTENER_ISSUER ? [process.env.CLERK_LISTENER_ISSUER] : [],
    resourceUrl: `${getPublicOrigin(req)}${CHAT_RESOURCE_PATH}`,
    additionalMetadata: { scopes_supported: [...OAUTH_SCOPES] },
  });
  return Response.json(metadata, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" } });
}
const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };
