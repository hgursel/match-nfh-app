import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  agents,
  profiles,
  swipes,
  matches,
  agentMatches,
  messages,
} from "./stores.mts";
import type { Swipe, Match, AgentMatchIndex } from "./types.mts";

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export function registerTools(server: McpServer, agentId: string) {
  // --- get_profile ---
  server.tool(
    "get_profile",
    "Get your current agent profile markdown.",
    {},
    async () => {
      const profile = await profiles().get(agentId, { type: "text" });
      if (!profile) return text("No profile found.");
      return text(profile);
    }
  );

  // --- update_profile ---
  server.tool(
    "update_profile",
    "Update your agent profile with new markdown content.",
    { profile: z.string().describe("New markdown profile content") },
    async ({ profile }) => {
      const agentData = (await agents().get(agentId, { type: "json" })) as {
        name: string;
      } | null;
      await profiles().set(agentId, profile, {
        metadata: {
          agentId,
          name: agentData?.name ?? "Unknown",
          updatedAt: new Date().toISOString(),
        },
      });
      return text("Profile updated successfully.");
    }
  );

  // --- browse_feed ---
  server.tool(
    "browse_feed",
    "Browse agent profiles you haven't seen yet. Returns a feed of agents to potentially swipe on.",
    {
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of profiles to fetch (default 10, max 50)"),
    },
    async ({ limit }) => {
      const seenSet = new Set<string>();
      const swipeList = await swipes().list({ prefix: `${agentId}/` });
      for (const entry of swipeList.blobs) {
        seenSet.add(entry.key.split("/")[1]);
      }

      const allProfiles = await profiles().list();
      const candidates = allProfiles.blobs.filter(
        (e) => e.key !== agentId && !seenSet.has(e.key)
      );

      const selected = shuffle(candidates).slice(0, limit);

      if (selected.length === 0) {
        return text("No new profiles to show. Check back later!");
      }

      const results = await Promise.all(
        selected.map(async (entry) => {
          const [profile, agentRecord] = await Promise.all([
            profiles().get(entry.key, { type: "text" }),
            agents().get(entry.key, { type: "json" }) as Promise<{
              name: string;
            } | null>,
          ]);
          return `## ${agentRecord?.name ?? "Unknown"} (${entry.key})\n\n${profile ?? ""}\n\n---`;
        })
      );

      return text(`Found ${selected.length} agent(s):\n\n${results.join("\n\n")}`);
    }
  );

  // --- swipe ---
  server.tool(
    "swipe",
    "Swipe yes or no on an agent. If both agents swipe yes, it's a match!",
    {
      targetAgentId: z.string().describe("The agent ID to swipe on"),
      direction: z.enum(["yes", "no"]).describe("'yes' to like, 'no' to pass"),
    },
    async ({ targetAgentId, direction }) => {
      if (targetAgentId === agentId) {
        return text("Cannot swipe on yourself.");
      }

      const target = await agents().get(targetAgentId, { type: "text" });
      if (!target) return text("Target agent not found.");

      const swipe: Swipe = { direction, createdAt: new Date().toISOString() };
      await swipes().set(`${agentId}/${targetAgentId}`, JSON.stringify(swipe));

      if (direction === "no") return text("Passed on this agent.");

      const reciprocal = (await swipes().get(`${targetAgentId}/${agentId}`, {
        type: "json",
        consistency: "strong",
      })) as Swipe | null;

      if (reciprocal?.direction === "yes") {
        const matchId = uuidv4();
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
          agentMatches().set(
            `${agentId}/${matchId}`,
            JSON.stringify(index1)
          ),
          agentMatches().set(
            `${targetAgentId}/${matchId}`,
            JSON.stringify(index2)
          ),
        ]);

        return text(
          `It's a match! Match ID: ${matchId}\n\nYou can now start a conversation using send_message.`
        );
      }

      return text("Swiped yes! Waiting for them to swipe back.");
    }
  );

  // --- list_matches ---
  server.tool(
    "list_matches",
    "List all your mutual matches.",
    {},
    async () => {
      const list = await agentMatches().list({ prefix: `${agentId}/` });

      if (list.blobs.length === 0) {
        return text("No matches yet. Keep browsing and swiping!");
      }

      const results = await Promise.all(
        list.blobs.map(async (entry) => {
          const index = (await agentMatches().get(entry.key, {
            type: "json",
          })) as AgentMatchIndex;
          const partner = (await agents().get(index.partnerId, {
            type: "json",
          })) as { name: string } | null;
          return `- **${partner?.name ?? "Unknown"}** (${index.partnerId}) — Match ID: ${index.matchId}`;
        })
      );

      return text(`Your matches (${list.blobs.length}):\n\n${results.join("\n")}`);
    }
  );

  // --- read_conversation ---
  server.tool(
    "read_conversation",
    "Read messages from a match conversation.",
    {
      matchId: z.string().describe("The match ID to read messages from"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(50)
        .describe("Max messages to fetch (default 50)"),
      after: z
        .string()
        .optional()
        .describe("Only get messages after this ISO timestamp"),
    },
    async ({ matchId, limit, after }) => {
      const match = (await matches().get(matchId, { type: "json" })) as Match | null;
      if (!match) return text("Match not found.");
      if (!match.agents.includes(agentId)) {
        return text("Not a participant in this match.");
      }

      const list = await messages().list({ prefix: `${matchId}/` });
      const filtered = list.blobs
        .filter((e) => (after ? e.key > `${matchId}/${after}` : true))
        .slice(0, limit);

      if (filtered.length === 0) {
        return text("No messages yet. Start the conversation with send_message!");
      }

      const result = await Promise.all(
        filtered.map(async (entry) => {
          const [body, meta] = await Promise.all([
            messages().get(entry.key, { type: "text" }),
            messages().getMetadata(entry.key),
          ]);
          const metadata = meta?.metadata as Record<string, string> | undefined;
          return `### From: ${metadata?.senderId ?? "?"} (${metadata?.createdAt ?? "?"})\n\n${body ?? ""}\n\n---`;
        })
      );

      return text(`Conversation (${filtered.length} messages):\n\n${result.join("\n\n")}`);
    }
  );

  // --- send_message ---
  server.tool(
    "send_message",
    "Send a markdown message to a match conversation.",
    {
      matchId: z.string().describe("The match ID to send a message to"),
      message: z.string().describe("The markdown message to send"),
    },
    async ({ matchId, message }) => {
      const match = (await matches().get(matchId, { type: "json" })) as Match | null;
      if (!match) return text("Match not found.");
      if (!match.agents.includes(agentId)) {
        return text("Not a participant in this match.");
      }

      const messageId = uuidv4();
      const createdAt = new Date().toISOString();
      const key = `${matchId}/${createdAt}-${messageId}`;

      await messages().set(key, message, {
        metadata: { id: messageId, senderId: agentId, matchId, createdAt },
      });

      return text(`Message sent! (ID: ${messageId}, at ${createdAt})`);
    }
  );
}
