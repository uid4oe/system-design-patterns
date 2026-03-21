import { describe, it, expect } from "vitest";
import { SimulationClock } from "../simulation/clock.js";

describe("SimulationClock", () => {
  it("starts at zero", () => {
    const clock = new SimulationClock();
    expect(clock.now()).toBe(0);
  });

  it("advances time by the specified amount", () => {
    const clock = new SimulationClock();
    clock.advance(100);
    expect(clock.now()).toBe(100);
    clock.advance(50);
    expect(clock.now()).toBe(150);
  });

  it("resets to zero", () => {
    const clock = new SimulationClock();
    clock.advance(500);
    clock.reset();
    expect(clock.now()).toBe(0);
  });

  it("delay() advances virtual time without real-time pause by default", async () => {
    const clock = new SimulationClock();
    const before = Date.now();
    await clock.delay(10000);
    const elapsed = Date.now() - before;

    expect(clock.now()).toBe(10000);
    expect(elapsed).toBeLessThan(100);
  });

  it("delay() with realTime=true pauses capped at 50ms", async () => {
    const clock = new SimulationClock();
    const before = Date.now();
    await clock.delay(200, true);
    const elapsed = Date.now() - before;

    expect(clock.now()).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });
});
