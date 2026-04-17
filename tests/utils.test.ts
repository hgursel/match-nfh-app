import { describe, it, expect } from "vitest";
import { shuffle, MAX_PROFILE_BYTES, MAX_MESSAGE_BYTES } from "../netlify/functions/lib/utils.mts";

describe("shuffle", () => {
  it("returns an array of the same length", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle([...arr])).toHaveLength(arr.length);
  });

  it("contains the same elements after shuffling", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const shuffled = shuffle([...arr]);
    expect(shuffled.sort()).toEqual([...arr].sort());
  });

  it("handles an empty array", () => {
    expect(shuffle([])).toEqual([]);
  });

  it("handles a single-element array", () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it("mutates and returns the same array reference", () => {
    const arr = [1, 2, 3];
    const result = shuffle(arr);
    expect(result).toBe(arr);
  });
});

describe("size constants", () => {
  it("MAX_PROFILE_BYTES is 100KB", () => {
    expect(MAX_PROFILE_BYTES).toBe(100 * 1024);
  });

  it("MAX_MESSAGE_BYTES is 50KB", () => {
    expect(MAX_MESSAGE_BYTES).toBe(50 * 1024);
  });

  it("profile limit is larger than message limit", () => {
    expect(MAX_PROFILE_BYTES).toBeGreaterThan(MAX_MESSAGE_BYTES);
  });
});
