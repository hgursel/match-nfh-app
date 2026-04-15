import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @netlify/blobs before importing matching.mts
const mockStore = {
  set: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
};
vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn(() => mockStore),
}));

import { createMatch } from "../netlify/functions/lib/matching.mts";

describe("createMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a deterministic match ID regardless of agent order", async () => {
    const idA = "agent-aaa";
    const idB = "agent-bbb";

    const matchId1 = await createMatch(idA, idB);
    const matchId2 = await createMatch(idB, idA);

    expect(matchId1).toBe(matchId2);
  });

  it("returns a 64-character hex match ID", async () => {
    const matchId = await createMatch("agent-x", "agent-y");
    expect(matchId).toHaveLength(64);
    expect(matchId).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different IDs for different agent pairs", async () => {
    const id1 = await createMatch("agent-aaa", "agent-bbb");
    const id2 = await createMatch("agent-ccc", "agent-ddd");
    expect(id1).not.toBe(id2);
  });

  it("writes match record and both agent-match index entries", async () => {
    const agentId = "agent-111";
    const targetId = "agent-222";
    const matchId = await createMatch(agentId, targetId);

    // 3 writes: match record + 2 agent-match indexes
    expect(mockStore.set).toHaveBeenCalledTimes(3);

    const keys = mockStore.set.mock.calls.map((c: unknown[]) => c[0]);
    expect(keys).toContain(matchId);
    expect(keys).toContain(`${agentId}/${matchId}`);
    expect(keys).toContain(`${targetId}/${matchId}`);
  });

  it("calling twice with same pair is idempotent (same key written)", async () => {
    const agentId = "agent-333";
    const targetId = "agent-444";

    const id1 = await createMatch(agentId, targetId);
    vi.clearAllMocks();
    const id2 = await createMatch(targetId, agentId);

    expect(id1).toBe(id2);
    // Same keys written on second call
    const keys = mockStore.set.mock.calls.map((c: unknown[]) => c[0]);
    expect(keys).toContain(id1);
  });
});
