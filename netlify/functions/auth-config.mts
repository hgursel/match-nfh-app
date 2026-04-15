import type { Config, Context } from "@netlify/functions";
import { json, error } from "./lib/response.mts";

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "GET") {
    return error("Method not allowed", 405);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return error("Google OAuth not configured", 500);
  }

  return json({ clientId });
}

export const config: Config = {
  path: "/api/auth/config",
  method: "GET",
};
