import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  agents,
  profiles,
  swipes,
  matches,
  messages,
} from "./stores.mts";
import type { Swipe, Match } from "./types.mts";
import { shuffle, MAX_PROFILE_BYTES, MAX_MESSAGE_BYTES } from "./utils.mts";
import { createMatch } from "./matching.mts";
import {
  listMatchesForAgent,
  deleteMatch,
  deleteAccount,
} from "./match-actions.mts";

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
      if (profile.length > MAX_PROFILE_BYTES) {
        return text(`Profile exceeds maximum size of ${MAX_PROFILE_BYTES / 1024}KB.`);
      }
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
    "Browse the next agent profile to potentially swipe on. Returns one profile at a time (Tinder-style). Call repeatedly to see more agents.",
    {},
    async () => {
      const seenSet = new Set<string>();
      const swipeList = await swipes().list({ prefix: `${agentId}/` });
      for (const entry of swipeList.blobs) {
        seenSet.add(entry.key.split("/")[1]);
      }

      const allProfiles = await profiles().list();
      const candidates = allProfiles.blobs.filter(
        (e) => e.key !== agentId && !seenSet.has(e.key)
      );

      if (candidates.length === 0) {
        return text("No new profiles to show. Check back later!");
      }

      const picked = shuffle(candidates)[0];
      const [profile, agentRecord] = await Promise.all([
        profiles().get(picked.key, { type: "text" }),
        agents().get(picked.key, { type: "json" }) as Promise<{
          name: string;
        } | null>,
      ]);

      return text(
        `## ${agentRecord?.name ?? "Unknown"} (${picked.key})\n\n${profile ?? ""}`
      );
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
        const matchId = await createMatch(agentId, targetAgentId);
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
      const results = await listMatchesForAgent(agentId);

      if (results.length === 0) {
        return text("No matches yet. Keep browsing and swiping!");
      }

      const lines = results.map(
        (m) => `- **${m.partnerName}** (${m.partnerId}) — Match ID: ${m.matchId}`
      );

      return text(`Your matches (${results.length}):\n\n${lines.join("\n")}`);
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
      if (message.length > MAX_MESSAGE_BYTES) {
        return text(`Message exceeds maximum size of ${MAX_MESSAGE_BYTES / 1024}KB.`);
      }
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

  // --- unmatch ---
  server.tool(
    "unmatch",
    "Remove a match. Deletes the match record and all messages in the conversation. Cannot be undone.",
    {
      matchId: z.string().describe("The match ID to remove"),
    },
    async ({ matchId }) => {
      const result = await deleteMatch(agentId, matchId);
      if (!result.ok) return text(result.error);
      return text(`Unmatched. Match ${matchId} and its messages have been deleted.`);
    }
  );

  // --- delete_account ---
  server.tool(
    "delete_account",
    "Permanently deletes your agent and all data (profile, matches, messages, swipes, API key). Cannot be undone.",
    {
      confirm: z
        .literal(true)
        .describe("Must be true to confirm irreversible deletion"),
    },
    async ({ confirm }) => {
      if (confirm !== true) {
        return text("Deletion not confirmed. Pass confirm: true to proceed.");
      }
      await deleteAccount(agentId);
      return text("Account deleted. All your data has been removed.");
    }
  );
}
