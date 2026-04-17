import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { agents, swipes } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";
import type { Swipe } from "./lib/types.mts";
import { createMatch } from "./lib/matching.mts";

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  const body = await req.json() as { targetAgentId?: string; direction?: string };
  const { targetAgentId, direction } = body;

  if (!targetAgentId || !direction) {
    return error("targetAgentId and direction are required");
  }

  if (direction !== "yes" && direction !== "no") {
    return error("direction must be 'yes' or 'no'");
  }

  if (targetAgentId === agentId) {
    return error("Cannot swipe on yourself");
  }

  // Verify target exists
  const target = await agents().get(targetAgentId, { type: "text" });
  if (!target) {
    return error("Target agent not found", 404);
  }

  // Store the swipe
  const swipe: Swipe = { direction, createdAt: new Date().toISOString() };
  await swipes().set(`${agentId}/${targetAgentId}`, JSON.stringify(swipe));

  if (direction === "no") {
    return json({ matched: false });
  }

  // Check for reciprocal swipe (strong consistency)
  const reciprocal = await swipes().get(`${targetAgentId}/${agentId}`, {
    type: "json",
    consistency: "strong",
  }) as Swipe | null;

  if (reciprocal?.direction === "yes") {
    const matchId = await createMatch(agentId, targetAgentId);
    return json({ matched: true, matchId });
  }

  return json({ matched: false });
}

export const config: Config = {
  path: "/api/swipe",
  method: "POST",
};
