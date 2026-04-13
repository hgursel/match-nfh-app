import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { swipes, profiles, agents } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "GET") {
    return error("Method not allowed", 405);
  }

  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 50);

  // Get all agents this agent has already swiped on
  const seenSet = new Set<string>();
  const swipeList = await swipes().list({ prefix: `${agentId}/` });
  for (const entry of swipeList.blobs) {
    const targetId = entry.key.split("/")[1];
    seenSet.add(targetId);
  }

  // Get all agent profiles
  const allProfiles = await profiles().list();
  const candidates = allProfiles.blobs.filter(
    (entry) => entry.key !== agentId && !seenSet.has(entry.key)
  );

  // Shuffle and limit
  const selected = shuffle(candidates).slice(0, limit);

  // Fetch profile content and agent names
  const results = await Promise.all(
    selected.map(async (entry) => {
      const [profile, agentRecord] = await Promise.all([
        profiles().get(entry.key, { type: "text" }),
        agents().get(entry.key, { type: "json" }) as Promise<{ name: string } | null>,
      ]);
      return {
        agentId: entry.key,
        name: agentRecord?.name ?? "Unknown",
        profile: profile ?? "",
      };
    })
  );

  return json({ profiles: results });
}

export const config: Config = {
  path: "/api/feed",
  method: "GET",
};
