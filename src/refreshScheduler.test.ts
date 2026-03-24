import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RefreshScheduler } from "./refreshScheduler";
import type { ExtensionConfig } from "./types";

function makeConfig(minutes = 5): ExtensionConfig {
  return {
    refreshIntervalMinutes: minutes,
    manualToken: "",
    accountUuid: "",
    statusBarPosition: "right",
    statusBarPriority: 100,
    showModelBreakdown: false,
    notifyAtThreshold: 0.9,
  };
}

describe("RefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should call the callback at the configured interval", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.start(makeConfig(1)); // 1 minute

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000); // 1 minute
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000); // 2 minutes total
    expect(callback).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  it("should not fire after stop", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.start(makeConfig(1));
    scheduler.stop();

    vi.advanceTimersByTime(120_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should restart with new interval on subsequent start()", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.start(makeConfig(1)); // 1 minute
    vi.advanceTimersByTime(60_000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Restart with 2-minute interval
    scheduler.start(makeConfig(2));
    vi.advanceTimersByTime(60_000); // only 1 minute since restart — should not fire
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000); // 2 minutes since restart
    expect(callback).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  it("scheduleRetry should fire once after delay", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.scheduleRetry(5000);

    vi.advanceTimersByTime(4999);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);

    // Should not fire again
    vi.advanceTimersByTime(10_000);
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it("scheduleRetry should cancel previous retry", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.scheduleRetry(5000);
    scheduler.scheduleRetry(10_000); // replaces the first

    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled(); // first was cancelled

    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it("stop should cancel pending retries", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.scheduleRetry(5000);
    scheduler.stop();

    vi.advanceTimersByTime(10_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("dispose should clean up all timers", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RefreshScheduler(callback);

    scheduler.start(makeConfig(1));
    scheduler.scheduleRetry(5000);
    scheduler.dispose();

    vi.advanceTimersByTime(120_000);
    expect(callback).not.toHaveBeenCalled();
  });
});
