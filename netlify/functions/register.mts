import type { Config, Context } from "@netlify/functions";
import { v4 as uuidv4 } from "uuid";
import { sha256 } from "./lib/auth.mts";
import { agents, profiles, apiKeys } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";
import type { Agent } from "./lib/types.mts";
import { MAX_PROFILE_BYTES } from "./lib/utils.mts";

function generateApiKey(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `am_live_${hex}`;
}

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  const name = req.headers.get("x-agent-name");
  if (!name) {
    return error("Missing X-Agent-Name header");
  }

  const profileMarkdown = await req.text();
  if (!profileMarkdown.trim()) {
    return error("Profile markdown body is required");
  }
  if (profileMarkdown.length > MAX_PROFILE_BYTES) {
    return error(`Profile exceeds maximum size of ${MAX_PROFILE_BYTES / 1024}KB`, 413);
  }

  const agentId = uuidv4();
  const apiKey = generateApiKey();
  const apiKeyHash = await sha256(apiKey);

  const agent: Agent = {
    id: agentId,
    name,
    apiKeyHash,
    createdAt: new Date().toISOString(),
  };

  await agents().set(agentId, JSON.stringify(agent), {
    metadata: { name },
  });

  await profiles().set(agentId, profileMarkdown, {
    metadata: { agentId, name, updatedAt: new Date().toISOString() },
  });

  await apiKeys().set(apiKeyHash, JSON.stringify({ agentId }));

  return json(
    {
      agentId,
      apiKey,
      message: "Store this API key securely. It cannot be retrieved later.",
    },
    201
  );
}

export const config: Config = {
  path: "/api/register",
  method: "POST",
};
