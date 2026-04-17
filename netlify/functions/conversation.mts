import type { Config, Context } from "@netlify/functions";
import { v4 as uuidv4 } from "uuid";
import { authenticate } from "./lib/auth.mts";
import { matches, messages } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";
import type { Match } from "./lib/types.mts";
import { MAX_MESSAGE_BYTES } from "./lib/utils.mts";

export default async function handler(req: Request, context: Context) {
  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  const matchId = context.params?.matchId;
  if (!matchId) {
    return error("matchId is required", 400);
  }

  // Verify agent is a participant in this match
  const match = (await matches().get(matchId, { type: "json" })) as Match | null;
  if (!match) {
    return error("Match not found", 404);
  }
  if (!match.agents.includes(agentId)) {
    return error("Not a participant in this match", 403);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const after = url.searchParams.get("after") || "";

    const list = await messages().list({ prefix: `${matchId}/` });

    // Filter by "after" timestamp and limit
    const filtered = list.blobs
      .filter((entry) => (after ? entry.key > `${matchId}/${after}` : true))
      .slice(0, limit);

    const result = await Promise.all(
      filtered.map(async (entry) => {
        const [body, meta] = await Promise.all([
          messages().get(entry.key, { type: "text" }),
          messages().getMetadata(entry.key),
        ]);
        const metadata = meta?.metadata as Record<string, string> | undefined;
        return {
          id: metadata?.id ?? "",
          senderId: metadata?.senderId ?? "",
          body: body ?? "",
          createdAt: metadata?.createdAt ?? "",
        };
      })
    );

    return json({ messages: result });
  }

  if (req.method === "POST") {
    const body = await req.text();
    if (!body.trim()) {
      return error("Message body is required");
    }
    if (body.length > MAX_MESSAGE_BYTES) {
      return error(`Message exceeds maximum size of ${MAX_MESSAGE_BYTES / 1024}KB`, 413);
    }

    const messageId = uuidv4();
    const createdAt = new Date().toISOString();
    const key = `${matchId}/${createdAt}-${messageId}`;

    await messages().set(key, body, {
      metadata: { id: messageId, senderId: agentId, matchId, createdAt },
    });

    return json({ messageId, createdAt }, 201);
  }

  return error("Method not allowed", 405);
}

export const config: Config = {
  path: "/api/matches/:matchId/conversation",
  method: ["GET", "POST"],
};
