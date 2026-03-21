import { describe, it, expect } from "vitest";
import { SeededRandom } from "../simulation/random.js";

describe("SeededRandom", () => {
  it("produces identical sequences for the same seed", () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = new SeededRandom(1);
    const rng2 = new SeededRandom(2);

    const v1 = rng1.next();
    const v2 = rng2.next();

    expect(v1).not.toBe(v2);
  });

  it("produces values in [0, 1)", () => {
    const rng = new SeededRandom(99);

    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("chance() returns true at expected probability", () => {
    const rng = new SeededRandom(12345);
    const trials = 10000;
    let trueCount = 0;

    for (let i = 0; i < trials; i++) {
      if (rng.chance(0.3)) trueCount++;
    }

    const ratio = trueCount / trials;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
  });

  it("between() returns values in the specified range", () => {
    const rng = new SeededRandom(7);

    for (let i = 0; i < 100; i++) {
      const value = rng.between(10, 20);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
    }
  });

  it("intBetween() returns integers in the specified range", () => {
    const rng = new SeededRandom(55);

    for (let i = 0; i < 100; i++) {
      const value = rng.intBetween(1, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
