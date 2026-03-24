import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeColor } from "./__mocks__/vscode";
import { ClaudeUsageStatusBar, parseResetAt, formatTimeRemaining } from "./statusBar";
import type { UsageSnapshot, ExtensionConfig, HistoryTuple } from "./types";

function makeConfig(overrides: Partial<ExtensionConfig> = {}): ExtensionConfig {
  return {
    refreshIntervalMinutes: 5,
    manualToken: "",
    accountUuid: "",
    statusBarPosition: "right",
    statusBarPriority: 100,
    showModelBreakdown: false,
    notifyAtThreshold: 0.9,
    ...overrides,
  };
}

function makeSnapshot(fiveHourUtil: number | null, sevenDayUtil: number | null): UsageSnapshot {
  const now = new Date();
  const fiveHourReset = new Date(now.getTime() + 3 * 3600_000).toISOString();
  const sevenDayReset = new Date(now.getTime() + 5 * 86400_000).toISOString();
  return {
    fiveHour: fiveHourUtil !== null
      ? { utilization: fiveHourUtil, resets_at: fiveHourReset }
      : null,
    sevenDay: sevenDayUtil !== null
      ? { utilization: sevenDayUtil, resets_at: sevenDayReset }
      : null,
    sevenDayOpus: null,
    sevenDaySonnet: null,
    fetchedAt: now,
  };
}

describe("ClaudeUsageStatusBar color coding", () => {
  let bar: ClaudeUsageStatusBar;
  const config = makeConfig();

  beforeEach(() => {
    bar = new ClaudeUsageStatusBar(config);
  });

  it("should use default color for normal usage (<80%)", () => {
    bar.showUsage(makeSnapshot(0.5, 0.3), config);
    const item = (bar as any).item;
    expect(item.color).toBeUndefined();
    expect(item.backgroundColor).toBeUndefined();
    expect(item.text).toContain("$(pulse)");
  });

  it("should use warning color at 80% (orange threshold)", () => {
    bar.showUsage(makeSnapshot(0.8, 0.3), config);
    const item = (bar as any).item;
    expect(item.color).toBeInstanceOf(ThemeColor);
    expect((item.color as ThemeColor).id).toBe("statusBarItem.warningForeground");
    expect(item.text).toContain("$(alert)");
  });

  it("should use warning color when weekly is at 80%", () => {
    bar.showUsage(makeSnapshot(0.5, 0.8), config);
    const item = (bar as any).item;
    expect(item.color).toBeInstanceOf(ThemeColor);
    expect((item.color as ThemeColor).id).toBe("statusBarItem.warningForeground");
  });

  it("should use error color at 100% (red threshold)", () => {
    bar.showUsage(makeSnapshot(1.0, 0.3), config);
    const item = (bar as any).item;
    expect(item.color).toBeInstanceOf(ThemeColor);
    expect((item.color as ThemeColor).id).toBe("statusBarItem.errorForeground");
    expect(item.backgroundColor).toBeInstanceOf(ThemeColor);
    expect((item.backgroundColor as ThemeColor).id).toBe("statusBarItem.errorBackground");
    expect(item.text).toContain("$(warning)");
  });

  it("should use error color when over 100%", () => {
    bar.showUsage(makeSnapshot(1.2, 0.5), config);
    const item = (bar as any).item;
    expect((item.color as ThemeColor).id).toBe("statusBarItem.errorForeground");
  });

  it("should display percentage text correctly", () => {
    bar.showUsage(makeSnapshot(0.5, 0.3), config);
    const item = (bar as any).item;
    expect(item.text).toContain("Daily:50%");
    expect(item.text).toContain("Weekly:30%");
  });
});

describe("ClaudeUsageStatusBar trend arrows", () => {
  const config = makeConfig();

  it("should show up arrow when usage increased by more than 2%", () => {
    const bar = new ClaudeUsageStatusBar(config);
    const oneHourAgo = Date.now() - 61 * 60 * 1000;
    const history: HistoryTuple[] = [[oneHourAgo, 40, 25]];

    bar.showUsage(makeSnapshot(0.5, 0.3), config, history);
    const item = (bar as any).item;
    // 50% now vs 40% 1h ago = +10 => up arrow
    expect(item.text).toMatch(/Daily:50%/);
    // The up arrow character
    expect(item.text).toContain("\u2191");
  });

  it("should show down arrow when usage decreased by more than 2%", () => {
    const bar = new ClaudeUsageStatusBar(config);
    const oneHourAgo = Date.now() - 61 * 60 * 1000;
    const history: HistoryTuple[] = [[oneHourAgo, 60, 50]];

    bar.showUsage(makeSnapshot(0.5, 0.3), config, history);
    const item = (bar as any).item;
    // 50% now vs 60% 1h ago = -10 => down arrow
    expect(item.text).toContain("\u2193");
  });

  it("should not show stable arrow in compact status bar text", () => {
    const bar = new ClaudeUsageStatusBar(config);
    const oneHourAgo = Date.now() - 61 * 60 * 1000;
    const history: HistoryTuple[] = [[oneHourAgo, 50, 30]];

    bar.showUsage(makeSnapshot(0.5, 0.3), config, history);
    const item = (bar as any).item;
    // Delta is 0, so stable arrow (->), but compact mode strips it
    expect(item.text).not.toContain("\u2192");
  });

  it("should show no arrow when there is no history", () => {
    const bar = new ClaudeUsageStatusBar(config);
    bar.showUsage(makeSnapshot(0.5, 0.3), config, []);
    const item = (bar as any).item;
    expect(item.text).not.toContain("\u2191");
    expect(item.text).not.toContain("\u2193");
    expect(item.text).not.toContain("\u2192");
  });
});

describe("ClaudeUsageStatusBar state methods", () => {
  const config = makeConfig();

  it("showLoading should set loading text", () => {
    const bar = new ClaudeUsageStatusBar(config);
    bar.showLoading();
    const item = (bar as any).item;
    expect(item.text).toContain("$(loading~spin)");
    expect(item.color).toBeUndefined();
  });

  it("showError should set error text and color", () => {
    const bar = new ClaudeUsageStatusBar(config);
    bar.showError({ kind: "network-error", message: "Offline" });
    const item = (bar as any).item;
    expect(item.text).toContain("Offline");
    expect(item.color).toBeInstanceOf(ThemeColor);
  });
});

describe("parseResetAt", () => {
  it("should return a locale string for valid ISO dates", () => {
    const result = parseResetAt("2026-02-21T09:00:00Z");
    expect(result).not.toBe("Unknown");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should return Unknown for invalid dates", () => {
    expect(parseResetAt("not-a-date")).toBe("Unknown");
  });
});

describe("formatTimeRemaining", () => {
  it("should return minutes for < 60 minutes", () => {
    const inThirtyMin = new Date(Date.now() + 30 * 60_000).toISOString();
    expect(formatTimeRemaining(inThirtyMin)).toMatch(/^\d+m$/);
  });

  it("should return hours for < 24 hours", () => {
    const inThreeHours = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect(formatTimeRemaining(inThreeHours)).toMatch(/^\d+h$/);
  });

  it("should return days for >= 24 hours", () => {
    const inFiveDays = new Date(Date.now() + 5 * 86400_000).toISOString();
    expect(formatTimeRemaining(inFiveDays)).toMatch(/^\d+d$/);
  });

  it("should return 'now' for past dates", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(formatTimeRemaining(past)).toBe("now");
  });
});
