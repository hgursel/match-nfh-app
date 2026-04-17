import { describe, it, expect, vi, beforeEach } from "vitest";

// Per-store mocks indexed by store name
type Store = {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  getMetadata: ReturnType<typeof vi.fn>;
};

const stores: Record<string, Store> = {};
function makeStore(): Store {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ blobs: [] }),
    getMetadata: vi.fn().mockResolvedValue(null),
  };
}

vi.mock("@netlify/blobs", () => ({
  getStore: vi.fn((name: string) => {
    if (!stores[name]) stores[name] = makeStore();
    return stores[name];
  }),
}));

import {
  listMatchesForAgent,
  deleteMatch,
  deleteAccount,
} from "../netlify/functions/lib/match-actions.mts";

beforeEach(() => {
  for (const k of Object.keys(stores)) delete stores[k];
});

describe("listMatchesForAgent", () => {
  it("returns match summaries with partner names resolved", async () => {
    const agentId = "agent-A";
    const am = (stores["agent-matches"] = makeStore());
    const ag = (stores["agents"] = makeStore());

    am.list.mockResolvedValue({
      blobs: [
        { key: `${agentId}/match1` },
        { key: `${agentId}/match2` },
      ],
    });
    am.get.mockImplementation(async (key: string) => {
      if (key === `${agentId}/match1`)
        return { matchId: "match1", partnerId: "agent-B" };
      if (key === `${agentId}/match2`)
        return { matchId: "match2", partnerId: "agent-C" };
      return null;
    });
    ag.get.mockImplementation(async (id: string) => {
      if (id === "agent-B") return { name: "Bob" };
      if (id === "agent-C") return { name: "Carol" };
      return null;
    });

    const result = await listMatchesForAgent(agentId);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      matchId: "match1",
      partnerId: "agent-B",
      partnerName: "Bob",
    });
    expect(result).toContainEqual({
      matchId: "match2",
      partnerId: "agent-C",
      partnerName: "Carol",
    });
  });

  it("falls back to 'Unknown' when partner record missing", async () => {
    const agentId = "agent-A";
    const am = (stores["agent-matches"] = makeStore());
    stores["agents"] = makeStore(); // returns null by default

    am.list.mockResolvedValue({ blobs: [{ key: `${agentId}/m1` }] });
    am.get.mockResolvedValue({ matchId: "m1", partnerId: "ghost" });

    const result = await listMatchesForAgent(agentId);
    expect(result[0].partnerName).toBe("Unknown");
  });
});

describe("deleteMatch", () => {
  it("returns 404 when match doesn't exist", async () => {
    stores["matches"] = makeStore();
    const result = await deleteMatch("agent-A", "missing");
    expect(result).toEqual({
      ok: false,
      error: "Match not found",
      status: 404,
    });
  });

  it("returns 403 when caller is not a participant", async () => {
    const m = (stores["matches"] = makeStore());
    m.get.mockResolvedValue({ id: "m1", agents: ["agent-X", "agent-Y"] });
    const result = await deleteMatch("agent-Z", "m1");
    expect(result).toEqual({
      ok: false,
      error: "Not a participant in this match",
      status: 403,
    });
  });

  it("deletes match record, both agent-match indexes, and all messages", async () => {
    const m = (stores["matches"] = makeStore());
    const am = (stores["agent-matches"] = makeStore());
    const msg = (stores["messages"] = makeStore());

    m.get.mockResolvedValue({ id: "m1", agents: ["agent-A", "agent-B"] });
    msg.list.mockResolvedValue({
      blobs: [{ key: "m1/2025-01-01-uuid1" }, { key: "m1/2025-01-02-uuid2" }],
    });

    const result = await deleteMatch("agent-A", "m1");
    expect(result).toEqual({ ok: true });

    expect(m.delete).toHaveBeenCalledWith("m1");
    expect(am.delete).toHaveBeenCalledWith("agent-A/m1");
    expect(am.delete).toHaveBeenCalledWith("agent-B/m1");
    expect(msg.delete).toHaveBeenCalledWith("m1/2025-01-01-uuid1");
    expect(msg.delete).toHaveBeenCalledWith("m1/2025-01-02-uuid2");
  });
});

describe("deleteAccount", () => {
  it("returns silently when agent does not exist", async () => {
    stores["agents"] = makeStore();
    await expect(deleteAccount("ghost")).resolves.toBeUndefined();
  });

  it("deletes all matches, swipes, profile, api key, user record, and agent", async () => {
    const agentId = "agent-A";
    const ag = (stores["agents"] = makeStore());
    const am = (stores["agent-matches"] = makeStore());
    const m = (stores["matches"] = makeStore());
    const msg = (stores["messages"] = makeStore());
    const sw = (stores["swipes"] = makeStore());
    const pr = (stores["profiles"] = makeStore());
    const ak = (stores["api-keys"] = makeStore());
    const us = (stores["users"] = makeStore());

    ag.get.mockResolvedValue({
      id: agentId,
      name: "A",
      apiKeyHash: "hashABC",
      googleId: "google-123",
    });
    am.list.mockResolvedValue({ blobs: [{ key: `${agentId}/m1` }] });
    am.get.mockResolvedValue({ matchId: "m1", partnerId: "agent-B" });
    m.get.mockResolvedValue({ id: "m1", agents: [agentId, "agent-B"] });
    msg.list.mockResolvedValue({ blobs: [{ key: "m1/msg1" }] });
    sw.list.mockResolvedValue({
      blobs: [{ key: `${agentId}/x` }, { key: `${agentId}/y` }],
    });

    await deleteAccount(agentId);

    // Match deletion
    expect(m.delete).toHaveBeenCalledWith("m1");
    expect(am.delete).toHaveBeenCalledWith(`${agentId}/m1`);
    expect(am.delete).toHaveBeenCalledWith("agent-B/m1");
    expect(msg.delete).toHaveBeenCalledWith("m1/msg1");

    // Outgoing swipes
    expect(sw.delete).toHaveBeenCalledWith(`${agentId}/x`);
    expect(sw.delete).toHaveBeenCalledWith(`${agentId}/y`);

    // Identity records
    expect(pr.delete).toHaveBeenCalledWith(agentId);
    expect(ak.delete).toHaveBeenCalledWith("hashABC");
    expect(us.delete).toHaveBeenCalledWith("google-123");
    expect(ag.delete).toHaveBeenCalledWith(agentId);
  });

  it("skips user record deletion when no googleId", async () => {
    const agentId = "agent-A";
    const ag = (stores["agents"] = makeStore());
    stores["agent-matches"] = makeStore();
    stores["swipes"] = makeStore();
    stores["profiles"] = makeStore();
    stores["api-keys"] = makeStore();
    const us = (stores["users"] = makeStore());

    ag.get.mockResolvedValue({
      id: agentId,
      name: "A",
      apiKeyHash: "hash",
    });

    await deleteAccount(agentId);
    expect(us.delete).not.toHaveBeenCalled();
    expect(ag.delete).toHaveBeenCalledWith(agentId);
  });
});
