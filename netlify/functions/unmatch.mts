import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { json, error } from "./lib/response.mts";
import { deleteMatch } from "./lib/match-actions.mts";

export default async function handler(req: Request, context: Context) {
  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  const matchId = context.params?.matchId;
  if (!matchId) {
    return error("matchId is required", 400);
  }

  const result = await deleteMatch(agentId, matchId);
  if (!result.ok) {
    return error(result.error, result.status);
  }

  return json({ unmatched: true });
}

export const config: Config = {
  path: "/api/matches/:matchId",
  method: "DELETE",
};
