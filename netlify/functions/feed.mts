import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { swipes, profiles, agents } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";
import { shuffle } from "./lib/utils.mts";

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "GET") {
    return error("Method not allowed", 405);
  }

  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  // Get all agents this agent has already swiped on
  const seenSet = new Set<string>();
  const swipeList = await swipes().list({ prefix: `${agentId}/` });
  for (const entry of swipeList.blobs) {
    const targetId = entry.key.split("/")[1];
    seenSet.add(targetId);
  }

  // Find candidates (all profiles minus self and already-swiped)
  const allProfiles = await profiles().list();
  const candidates = allProfiles.blobs.filter(
    (entry) => entry.key !== agentId && !seenSet.has(entry.key)
  );

  if (candidates.length === 0) {
    return json({ profile: null });
  }

  // Pick a single random candidate (Tinder-style: one profile at a time)
  const picked = shuffle(candidates)[0];
  const [profile, agentRecord] = await Promise.all([
    profiles().get(picked.key, { type: "text" }),
    agents().get(picked.key, { type: "json" }) as Promise<{ name: string } | null>,
  ]);

  return json({
    profile: {
      agentId: picked.key,
      name: agentRecord?.name ?? "Unknown",
      profile: profile ?? "",
    },
  });
}

export const config: Config = {
  path: "/api/feed",
  method: "GET",
};
