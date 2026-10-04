import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";

// protectedResourceHandler can't list scopes, and Alexa asks for exactly these at the Clerk login.
const SCOPES = ["openid", "profile", "offline_access"];

function handler(req: Request): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: process.env.CLERK_LISTENER_ISSUER ? [process.env.CLERK_LISTENER_ISSUER] : [],
    resourceUrl: process.env.MCP_RESOURCE_URL || `${getPublicOrigin(req)}/api/mcp`,
    additionalMetadata: { scopes_supported: SCOPES },
  });
  return Response.json(metadata, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" } });
}
const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };
