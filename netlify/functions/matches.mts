import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { agentMatches, agents } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";
import type { AgentMatchIndex } from "./lib/types.mts";

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "GET") {
    return error("Method not allowed", 405);
  }

  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  const list = await agentMatches().list({ prefix: `${agentId}/` });

  const results = await Promise.all(
    list.blobs.map(async (entry) => {
      const index = (await agentMatches().get(entry.key, {
        type: "json",
      })) as AgentMatchIndex;

      const partner = (await agents().get(index.partnerId, {
        type: "json",
      })) as { name: string } | null;

      return {
        matchId: index.matchId,
        partnerId: index.partnerId,
        partnerName: partner?.name ?? "Unknown",
      };
    })
  );

  return json({ matches: results });
}

export const config: Config = {
  path: "/api/matches",
  method: "GET",
};
