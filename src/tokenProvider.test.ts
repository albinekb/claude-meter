import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { detectTokenType, getCredentialsFilePaths, resolveToken } from "./tokenProvider";

describe("detectTokenType", () => {
  it("should detect admin keys", () => {
    expect(detectTokenType("sk-ant-admin-abc123")).toBe("admin-key");
  });

  it("should detect OAuth access tokens", () => {
    expect(detectTokenType("sk-ant-oat-abc123")).toBe("oauth");
  });

  it("should detect generic API keys", () => {
    expect(detectTokenType("sk-ant-api01-abc123")).toBe("api-key");
  });

  it("should default to oauth for unknown formats", () => {
    expect(detectTokenType("some-random-token")).toBe("oauth");
  });
});

describe("getCredentialsFilePaths", () => {
  const originalPlatform = process.platform;
  const originalAppdata = process.env.APPDATA;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalAppdata !== undefined) {
      process.env.APPDATA = originalAppdata;
    } else {
      delete process.env.APPDATA;
    }
  });

  it("should always include the standard ~/.claude/.credentials.json path", () => {
    const paths = getCredentialsFilePaths();
    const home = os.homedir();
    expect(paths[0]).toBe(path.join(home, ".claude", ".credentials.json"));
  });

  it("should include linux-specific paths on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const paths = getCredentialsFilePaths();
    const home = os.homedir();
    expect(paths).toContain(
      path.join(home, ".config", "claude", ".credentials.json")
    );
  });

  it("should include darwin-specific paths on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const paths = getCredentialsFilePaths();
    const home = os.homedir();
    expect(paths).toContain(
      path.join(home, "Library", "Application Support", "Claude", ".credentials.json")
    );
  });

  it("should include win32-specific paths on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
    const paths = getCredentialsFilePaths();
    expect(paths).toContain(
      path.join("C:\\Users\\test\\AppData\\Roaming", "Claude", ".credentials.json")
    );
    expect(paths).toContain(
      path.join("C:\\Users\\test\\AppData\\Roaming", "claude", ".credentials.json")
    );
  });
});

describe("resolveToken", () => {
  it("should use manual token when provided", async () => {
    const result = await resolveToken("sk-ant-admin-my-key");
    expect("token" in result).toBe(true);
    if ("token" in result) {
      expect(result.token).toBe("sk-ant-admin-my-key");
      expect(result.source).toBe("manual-setting");
      expect(result.tokenType).toBe("admin-key");
    }
  });

  it("should trim whitespace from manual token", async () => {
    const result = await resolveToken("  sk-ant-oat-token  ");
    expect("token" in result).toBe(true);
    if ("token" in result) {
      expect(result.token).toBe("sk-ant-oat-token");
    }
  });

  it("should return no-token error when no manual token and no credentials file", async () => {
    // With an empty manual token and no credentials files present
    const result = await resolveToken("");
    expect("kind" in result).toBe(true);
    if ("kind" in result) {
      expect(result.kind).toBe("no-token");
    }
  });

  it("should read from credentials file when no manual token is given", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-meter-test-"));
    const credDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(credDir, { recursive: true });
    const credFile = path.join(credDir, ".credentials.json");
    fs.writeFileSync(
      credFile,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat-file-token",
        },
      })
    );

    // Mock the HOME env var so os.homedir() returns our temp dir
    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;

    // Re-import to pick up the new HOME. We use dynamic import + vi.resetModules
    // to get a fresh module that reads the updated homedir.
    vi.resetModules();
    const freshModule = await import("./tokenProvider");

    try {
      const result = await freshModule.resolveToken("");
      expect("token" in result).toBe(true);
      if ("token" in result) {
        expect(result.token).toBe("sk-ant-oat-file-token");
        expect(result.source).toBe("auto-claude-code");
        expect(result.tokenType).toBe("oauth");
      }
    } finally {
      process.env.HOME = origHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
