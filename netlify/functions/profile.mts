import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { profiles } from "./lib/stores.mts";
import { json, markdown, error } from "./lib/response.mts";
import { MAX_PROFILE_BYTES } from "./lib/utils.mts";

export default async function handler(req: Request, _context: Context) {
  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  if (req.method === "GET") {
    const profile = await profiles().get(agentId, { type: "text" });
    if (!profile) {
      return error("Profile not found", 404);
    }
    return markdown(profile);
  }

  if (req.method === "PUT") {
    const body = await req.text();
    if (!body.trim()) {
      return error("Profile markdown body is required");
    }
    if (body.length > MAX_PROFILE_BYTES) {
      return error(`Profile exceeds maximum size of ${MAX_PROFILE_BYTES / 1024}KB`, 413);
    }

    await profiles().set(agentId, body, {
      metadata: { agentId, updatedAt: new Date().toISOString() },
    });

    return json({ message: "Profile updated" });
  }

  return error("Method not allowed", 405);
}

export const config: Config = {
  path: "/api/profile",
  method: ["GET", "PUT"],
};
