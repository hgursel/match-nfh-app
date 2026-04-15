import { sha256 } from "./auth.mts";
import { matches, agentMatches } from "./stores.mts";
import type { Match, AgentMatchIndex } from "./types.mts";

/**
 * Deterministic match ID derived from the two agent IDs (sorted).
 * If both agents swipe simultaneously, both will compute the same matchId,
 * making double-creation idempotent.
 */
async function matchIdFor(a: string, b: string): Promise<string> {
  const sorted = [a, b].sort().join(":");
  return sha256(sorted);
}

/**
 * Creates a mutual match between two agents.
 * Uses a deterministic match ID to prevent duplicate matches from race conditions.
 * Returns the match ID.
 */
export async function createMatch(agentId: string, targetAgentId: string): Promise<string> {
  const matchId = await matchIdFor(agentId, targetAgentId);

  const match: Match = {
    id: matchId,
    agents: [agentId, targetAgentId],
    createdAt: new Date().toISOString(),
  };

  const index1: AgentMatchIndex = { matchId, partnerId: targetAgentId };
  const index2: AgentMatchIndex = { matchId, partnerId: agentId };

  await Promise.all([
    matches().set(matchId, JSON.stringify(match), {
      metadata: { agent1: agentId, agent2: targetAgentId },
    }),
    agentMatches().set(`${agentId}/${matchId}`, JSON.stringify(index1)),
    agentMatches().set(`${targetAgentId}/${matchId}`, JSON.stringify(index2)),
  ]);

  return matchId;
}
