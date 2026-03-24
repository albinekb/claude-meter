import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UsageApiResponse } from "./types";

// Mock https before importing the module under test
vi.mock("https", () => {
  const EventEmitter = require("events");

  function createMockRequest(handler: any) {
    const req = new EventEmitter();
    (req as any).end = () => {
      // Trigger the handler asynchronously
      if (handler._responseCallback) {
        const res = handler._mockResponse;
        process.nextTick(() => handler._responseCallback(res));
      }
    };
    (req as any).destroy = () => {};
    return req;
  }

  return {
    request: vi.fn(),
    default: { request: vi.fn() },
  };
});

import * as https from "https";
import { fetchUsage, isExtensionError, normalizeResponse } from "./usageApi";

function setupMockResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const EventEmitter = require("events");
  (https.request as any).mockImplementation((options: any, callback: any) => {
    const res = new EventEmitter();
    res.statusCode = statusCode;
    res.headers = headers;
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

function setupMockError(errorMessage: string) {
  const EventEmitter = require("events");
  (https.request as any).mockImplementation((_options: any, _callback: any) => {
    const req = new EventEmitter();
    (req as any).end = () => {
      process.nextTick(() => req.emit("error", new Error(errorMessage)));
    };
    (req as any).destroy = () => {};
    return req;
  });
}

function setupMockTimeout() {
  const EventEmitter = require("events");
  (https.request as any).mockImplementation((_options: any, _callback: any) => {
    const req = new EventEmitter();
    (req as any).end = () => {
      process.nextTick(() => req.emit("timeout"));
    };
    (req as any).destroy = () => {};
    return req;
  });
}

describe("fetchUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse a successful API response", async () => {
    const apiResponse: UsageApiResponse = {
      five_hour: { utilization: 26, resets_at: "2026-02-21T09:00:00Z" },
      seven_day: { utilization: 50, resets_at: "2026-02-25T00:00:00Z" },
    };
    setupMockResponse(200, JSON.stringify(apiResponse));

    const result = await fetchUsage("test-token");
    expect(isExtensionError(result)).toBe(false);
    if (!isExtensionError(result)) {
      expect(result.five_hour?.utilization).toBe(26);
      expect(result.seven_day?.utilization).toBe(50);
    }
  });

  it("should return token-expired for 401", async () => {
    setupMockResponse(401, "Unauthorized");

    const result = await fetchUsage("bad-token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("token-expired");
      expect(result.httpStatus).toBe(401);
    }
  });

  it("should return token-expired for 403", async () => {
    setupMockResponse(403, "Forbidden");

    const result = await fetchUsage("bad-token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("token-expired");
      expect(result.httpStatus).toBe(403);
    }
  });

  it("should return rate-limited for 429", async () => {
    setupMockResponse(429, "Too Many Requests", { "retry-after": "30" });

    const result = await fetchUsage("token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("rate-limited");
      expect(result.retryAfter).toBeDefined();
    }
  });

  it("should return api-error for unexpected status codes", async () => {
    setupMockResponse(500, "Server Error");

    const result = await fetchUsage("token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("api-error");
      expect(result.httpStatus).toBe(500);
    }
  });

  it("should return parse-error for invalid JSON", async () => {
    setupMockResponse(200, "not-json{{{");

    const result = await fetchUsage("token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("parse-error");
    }
  });

  it("should return network-error on request error", async () => {
    setupMockError("ECONNREFUSED");

    const result = await fetchUsage("token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("network-error");
      expect(result.message).toContain("ECONNREFUSED");
    }
  });

  it("should return network-error on timeout", async () => {
    setupMockTimeout();

    const result = await fetchUsage("token");
    expect(isExtensionError(result)).toBe(true);
    if (isExtensionError(result)) {
      expect(result.kind).toBe("network-error");
      expect(result.message).toContain("timed out");
    }
  });
});

describe("isExtensionError", () => {
  it("should detect extension errors", () => {
    expect(isExtensionError({ kind: "api-error", message: "err" })).toBe(true);
  });

  it("should not flag valid API responses", () => {
    const response: UsageApiResponse = {
      five_hour: { utilization: 10, resets_at: "2026-01-01T00:00:00Z" },
    };
    expect(isExtensionError(response)).toBe(false);
  });
});

describe("normalizeResponse", () => {
  it("should convert utilization percentages to 0-1 fractions", () => {
    const raw: UsageApiResponse = {
      five_hour: { utilization: 26, resets_at: "2026-02-21T09:00:00Z" },
      seven_day: { utilization: 50, resets_at: "2026-02-25T00:00:00Z" },
    };
    const snapshot = normalizeResponse(raw);
    expect(snapshot.fiveHour?.utilization).toBeCloseTo(0.26);
    expect(snapshot.sevenDay?.utilization).toBeCloseTo(0.50);
    expect(snapshot.fetchedAt).toBeInstanceOf(Date);
  });

  it("should handle null/undefined windows", () => {
    const raw: UsageApiResponse = {};
    const snapshot = normalizeResponse(raw);
    expect(snapshot.fiveHour).toBeNull();
    expect(snapshot.sevenDay).toBeNull();
    expect(snapshot.sevenDayOpus).toBeNull();
    expect(snapshot.sevenDaySonnet).toBeNull();
  });

  it("should normalize opus and sonnet windows", () => {
    const raw: UsageApiResponse = {
      seven_day_opus: { utilization: 80, resets_at: "2026-02-25T00:00:00Z" },
      seven_day_sonnet: { utilization: 15, resets_at: "2026-02-25T00:00:00Z" },
    };
    const snapshot = normalizeResponse(raw);
    expect(snapshot.sevenDayOpus?.utilization).toBeCloseTo(0.80);
    expect(snapshot.sevenDaySonnet?.utilization).toBeCloseTo(0.15);
  });
});
