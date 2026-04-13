import { apiKeys } from "./stores.mts";

export async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticate(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const key = header.slice(7);
  const hash = await sha256(key);
  const record = await apiKeys().get(hash, { type: "json" }) as { agentId: string } | null;
  return record?.agentId ?? null;
}
