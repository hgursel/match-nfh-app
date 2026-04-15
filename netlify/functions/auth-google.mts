import type { Config, Context } from "@netlify/functions";
import { v4 as uuidv4 } from "uuid";
import { sha256 } from "./lib/auth.mts";
import { agents, profiles, apiKeys, users } from "./lib/stores.mts";
import { json, error } from "./lib/response.mts";
import type { Agent, UserRecord } from "./lib/types.mts";

function generateApiKey(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `am_live_${hex}`;
}

function maskApiKey(hash: string): string {
  return `am_live_****...${hash.slice(-4)}`;
}

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string;
  name: string;
  aud: string;
}

async function verifyGoogleToken(idToken: string): Promise<GoogleTokenInfo> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw new Error("Invalid Google ID token");
  }
  return (await res.json()) as GoogleTokenInfo;
}

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  const body = await req.json() as {
    idToken: string;
    agentName?: string;
    profile?: string;
    regenerate?: boolean;
  };

  if (!body.idToken) {
    return error("Missing idToken");
  }

  const tokenInfo = await verifyGoogleToken(body.idToken);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || tokenInfo.aud !== clientId) {
    return error("Token audience mismatch", 403);
  }

  if (tokenInfo.email_verified !== "true") {
    return error("Email not verified", 403);
  }

  const googleId = tokenInfo.sub;
  const existingUser = await users().get(googleId, { type: "json" }) as UserRecord | null;

  // Regenerate key for existing user
  if (existingUser && body.regenerate) {
    // Delete old key
    await apiKeys().delete(existingUser.apiKeyHash);

    // Generate new key
    const newApiKey = generateApiKey();
    const newHash = await sha256(newApiKey);

    // Update api-keys store
    await apiKeys().set(newHash, JSON.stringify({ agentId: existingUser.agentId }));

    // Update user record
    const updatedUser: UserRecord = { ...existingUser, apiKeyHash: newHash };
    await users().set(googleId, JSON.stringify(updatedUser));

    // Update agent record
    const agentData = await agents().get(existingUser.agentId, { type: "json" }) as Agent;
    agentData.apiKeyHash = newHash;
    await agents().set(existingUser.agentId, JSON.stringify(agentData), {
      metadata: { name: agentData.name },
    });

    return json({ agentId: existingUser.agentId, apiKey: newApiKey, regenerated: true });
  }

  // Returning user
  if (existingUser) {
    const agentData = await agents().get(existingUser.agentId, { type: "json" }) as Agent;
    return json({
      agentId: existingUser.agentId,
      name: agentData.name,
      maskedKey: maskApiKey(existingUser.apiKeyHash),
      isNew: false,
    });
  }

  // New user — if no agentName/profile, signal the frontend to show registration form
  if (!body.agentName?.trim() || !body.profile?.trim()) {
    return json({ isNew: true, needsRegistration: true });
  }

  const agentId = uuidv4();
  const apiKey = generateApiKey();
  const apiKeyHash = await sha256(apiKey);

  const agent: Agent = {
    id: agentId,
    name: body.agentName.trim(),
    apiKeyHash,
    createdAt: new Date().toISOString(),
    googleId,
  };

  const userRecord: UserRecord = {
    googleId,
    email: tokenInfo.email,
    displayName: tokenInfo.name,
    agentId,
    apiKeyHash,
    createdAt: new Date().toISOString(),
  };

  await agents().set(agentId, JSON.stringify(agent), {
    metadata: { name: agent.name },
  });

  await profiles().set(agentId, body.profile.trim(), {
    metadata: { agentId, name: agent.name, updatedAt: new Date().toISOString() },
  });

  await apiKeys().set(apiKeyHash, JSON.stringify({ agentId }));

  await users().set(googleId, JSON.stringify(userRecord));

  return json({ agentId, apiKey, isNew: true }, 201);
}

export const config: Config = {
  path: "/api/auth/google",
  method: "POST",
};
