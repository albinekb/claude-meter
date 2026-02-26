import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { StatsCacheSnapshot } from "./types";

interface StatsCacheFile {
  version?: number;
  dailyActivity?: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
  }>;
  dailyModelTokens?: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
}

function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getStatsCachePath(): string {
  return path.join(os.homedir(), ".claude", "stats-cache.json");
}

export async function readStatsCache(): Promise<StatsCacheSnapshot | null> {
  try {
    const uri = vscode.Uri.file(getStatsCachePath());
    const bytes = await vscode.workspace.fs.readFile(uri);
    const raw = new TextDecoder().decode(bytes);
    const data: StatsCacheFile = JSON.parse(raw) as StatsCacheFile;

    const today = localDateStr();

    const todayTokenEntry = data.dailyModelTokens?.find(d => d.date === today);
    const tokensByModel = todayTokenEntry?.tokensByModel ?? {};
    const totalTokensToday = Object.values(tokensByModel).reduce((sum, n) => sum + n, 0);

    const todayActivity = data.dailyActivity?.find(d => d.date === today);
    const messageCountToday = todayActivity?.messageCount ?? 0;
    const sessionCountToday = todayActivity?.sessionCount ?? 0;

    return {
      date: today,
      totalTokensToday,
      tokensByModel,
      messageCountToday,
      sessionCountToday,
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}
