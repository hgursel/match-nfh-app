import type { Config, Context } from "@netlify/functions";
import { authenticate } from "./lib/auth.mts";
import { json, error } from "./lib/response.mts";
import { deleteAccount } from "./lib/match-actions.mts";

export default async function handler(req: Request, _context: Context) {
  const agentId = await authenticate(req);
  if (!agentId) {
    return error("Unauthorized", 401);
  }

  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "true") {
    return error(
      "Account deletion requires ?confirm=true. This action is irreversible.",
      400
    );
  }

  await deleteAccount(agentId);
  return json({ deleted: true });
}

export const config: Config = {
  path: "/api/account",
  method: "DELETE",
};
