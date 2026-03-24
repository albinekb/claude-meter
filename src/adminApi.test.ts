import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock https before importing module
vi.mock("https", () => {
  return {
    request: vi.fn(),
    default: { request: vi.fn() },
  };
});

import * as https from "https";
import { fetchAdminUsage, isAdminError, formatTokens } from "./adminApi";

function setupMockResponse(statusCode: number, body: string) {
  const EventEmitter = require("events");
  (https.request as any).mockImplementation((options: any, callback: any) => {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    res.headers = {};
    res.setEncoding = () => {};

    const req = new EventEmitter();
    (req as any).end = () => {
      process.nextTick(() => {
        callback(res);
        process.nextTick(() => {
          res.emit("data", body);
          res.emit("end");
        });
      });
    };
    (req as any).destroy = () => {};
    return req;
  });
}

describe("fetchAdminUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should aggregate token counts across buckets", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const report = {
      data: [
        {
          starting_at: `${today}T00:00:00Z`,
          ending_at: `${today}T23:59:59Z`,
          results: [
            { uncached_input_tokens: 1000, cache_read_input_tokens: 500, output_tokens: 200 },
            { uncached_input_tokens: 300, cache_read_input_tokens: 0, output_tokens: 100 },
          ],
        },
        {
          starting_at: "2026-01-01T00:00:00Z",
          ending_at: "2026-01-01T23:59:59Z",
          results: [
            { uncached_input_tokens: 2000, cache_read_input_tokens: 1000, output_tokens: 500 },
          ],
        },
      ],
    };
    setupMockResponse(200, JSON.stringify(report));

    const result = await fetchAdminUsage("sk-ant-admin-test");
    expect(isAdminError(result)).toBe(false);
    if (!isAdminError(result)) {
      // Today bucket: (1000+500+300+0) input, (200+100) output
      expect(result.today).not.toBeNull();
      expect(result.today!.inputTokens).toBe(1800);
      expect(result.today!.outputTokens).toBe(300);

      // Week total: today + yesterday
      expect(result.week.inputTokens).toBe(1800 + 3000);
      expect(result.week.outputTokens).toBe(300 + 500);
    }
  });

  it("should handle empty data", async () => {
    setupMockResponse(200, JSON.stringify({ data: [] }));

    const result = await fetchAdminUsage("sk-ant-admin-test");
    expect(isAdminError(result)).toBe(false);
    if (!isAdminError(result)) {
      expect(result.today).toBeNull();
      expect(result.week.inputTokens).toBe(0);
      expect(result.week.outputTokens).toBe(0);
    }
  });

  it("should return error for 401", async () => {
    setupMockResponse(401, "Unauthorized");

    const result = await fetchAdminUsage("bad-key");
    expect(isAdminError(result)).toBe(true);
    if (isAdminError(result)) {
      expect(result.kind).toBe("token-expired");
    }
  });

  it("should return error for 429", async () => {
    setupMockResponse(429, "Rate limited");

    const result = await fetchAdminUsage("key");
    expect(isAdminError(result)).toBe(true);
    if (isAdminError(result)) {
      expect(result.kind).toBe("rate-limited");
    }
  });

  it("should return error for invalid JSON", async () => {
    setupMockResponse(200, "not json");

    const result = await fetchAdminUsage("key");
    expect(isAdminError(result)).toBe(true);
    if (isAdminError(result)) {
      expect(result.kind).toBe("parse-error");
    }
  });
});

describe("formatTokens", () => {
  it("should format millions", () => {
    expect(formatTokens(1_200_000)).toBe("1.2M");
    expect(formatTokens(5_000_000)).toBe("5.0M");
  });

  it("should format thousands", () => {
    expect(formatTokens(45_000)).toBe("45k");
    expect(formatTokens(1_500)).toBe("2k"); // rounds
    expect(formatTokens(1_000)).toBe("1k");
  });

  it("should return raw number for small values", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(42)).toBe("42");
  });
});

describe("isAdminError", () => {
  it("should detect errors", () => {
    expect(isAdminError({ kind: "api-error", message: "err" })).toBe(true);
  });

  it("should not flag valid snapshots", () => {
    expect(
      isAdminError({
        today: null,
        week: { startingAt: "", endingAt: "", inputTokens: 0, outputTokens: 0 },
        fetchedAt: new Date(),
      })
    ).toBe(false);
  });
});
