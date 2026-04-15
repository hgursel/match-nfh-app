import { describe, it, expect } from "vitest";
import { sha256 } from "../netlify/functions/lib/auth.mts";

describe("sha256", () => {
  it("returns a 64-character hex string", async () => {
    const result = await sha256("hello");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic — same input always produces same hash", async () => {
    const a = await sha256("test-api-key");
    const b = await sha256("test-api-key");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await sha256("key-one");
    const b = await sha256("key-two");
    expect(a).not.toBe(b);
  });

  it("hashes the empty string without throwing", async () => {
    const result = await sha256("");
    expect(result).toHaveLength(64);
  });
});
