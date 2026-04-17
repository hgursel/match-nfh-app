import {
  agents,
  profiles,
  apiKeys,
  swipes,
  matches,
  agentMatches,
  messages,
  users,
} from "./stores.mts";
import type { Agent, AgentMatchIndex, Match } from "./types.mts";

export interface MatchSummary {
  matchId: string;
  partnerId: string;
  partnerName: string;
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Lists all mutual matches for an agent with partner names resolved.
 * Shared by REST `/api/matches` and MCP `list_matches` tool.
 */
export async function listMatchesForAgent(
  agentId: string
): Promise<MatchSummary[]> {
  const list = await agentMatches().list({ prefix: `${agentId}/` });

  return Promise.all(
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
}

/**
 * Deletes a match: validates participation, then removes the match record,
 * both agentMatch index entries, and all messages under the match prefix.
 * Returns a structured result so callers can convert to the right HTTP status.
 */
export async function deleteMatch(
  agentId: string,
  matchId: string
): Promise<DeleteResult> {
  const match = (await matches().get(matchId, { type: "json" })) as Match | null;
  if (!match) {
    return { ok: false, error: "Match not found", status: 404 };
  }
  if (!match.agents.includes(agentId)) {
    return { ok: false, error: "Not a participant in this match", status: 403 };
  }

  const [partnerId] = match.agents.filter((a) => a !== agentId);

  // Find and delete all messages for this match
  const messageList = await messages().list({ prefix: `${matchId}/` });

  await Promise.all([
    matches().delete(matchId),
    agentMatches().delete(`${agentId}/${matchId}`),
    partnerId ? agentMatches().delete(`${partnerId}/${matchId}`) : Promise.resolve(),
    ...messageList.blobs.map((b) => messages().delete(b.key)),
  ]);

  return { ok: true };
}

/**
 * Permanently deletes an agent and all owned data.
 * - Removes all matches the agent participates in (and their messages)
 * - Removes all outgoing swipes
 * - Removes profile, api key, user record (if any), and agent record
 *
 * Note: Incoming swipes (other agents who swiped on this agent) are left as
 * orphaned records — cleaning them would require a full table scan and they
 * are functionally harmless once the agent record is gone.
 */
export async function deleteAccount(agentId: string): Promise<void> {
  const agent = (await agents().get(agentId, { type: "json" })) as Agent | null;
  if (!agent) return;

  // 1. Delete all matches (and their messages) involving this agent
  const matchList = await agentMatches().list({ prefix: `${agentId}/` });
  for (const entry of matchList.blobs) {
    const index = (await agentMatches().get(entry.key, {
      type: "json",
    })) as AgentMatchIndex | null;
    if (index?.matchId) {
      await deleteMatch(agentId, index.matchId);
    }
  }

  // 2. Delete all outgoing swipes
  const swipeList = await swipes().list({ prefix: `${agentId}/` });
  await Promise.all(swipeList.blobs.map((b) => swipes().delete(b.key)));

  // 3. Delete profile, api key, user record (if Google-linked), then agent
  await profiles().delete(agentId);
  await apiKeys().delete(agent.apiKeyHash);
  if (agent.googleId) {
    await users().delete(agent.googleId);
  }
  await agents().delete(agentId);
}
