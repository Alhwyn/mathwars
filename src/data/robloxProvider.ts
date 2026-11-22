import type { Config } from "../config.js";
import { isRecord } from "../utils.js";
import { requestRobloxJson } from "../roblox/api.js";
import type { DataProvider, LeaderboardEntry, LeaderboardKind } from "./provider.js";

function parseEntry(value: unknown, index: number): LeaderboardEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid leaderboard entry at index ${index}`);
  }

  const userId = value.userId;
  const username = value.username;
  const score = value.score;
  if (
    typeof userId !== "number" ||
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    typeof username !== "string" ||
    username.trim().length === 0 ||
    typeof score !== "number" ||
    !Number.isFinite(score)
  ) {
    throw new Error(`Invalid leaderboard entry at index ${index}`);
  }

  return { userId, username: username.trim(), score };
}

function parseLeaderboard(value: unknown): LeaderboardEntry[] {
  let entries: unknown;
  if (Array.isArray(value)) {
    entries = value;
  } else if (isRecord(value)) {
    entries = value.leaderboard ?? value.entries;
  }

  if (!Array.isArray(entries)) {
    throw new Error("Roblox DataStore value must be an array or contain a leaderboard/entries array");
  }

  const parsed = entries.map(parseEntry);
  const seenUserIds = new Set<number>();
  for (const entry of parsed) {
    if (seenUserIds.has(entry.userId)) {
      throw new Error(`Duplicate Roblox userId in leaderboard: ${entry.userId}`);
    }
    seenUserIds.add(entry.userId);
  }
  return parsed.sort((a, b) => b.score - a.score);
}

export class RobloxProvider implements DataProvider {
  private readonly apiKey: string;
  private readonly universeId: string;

  constructor(private readonly config: Config) {
    if (!config.robloxApiKey || !config.robloxUniverseId) {
      throw new Error("Roblox Open Cloud settings are missing");
    }
    this.apiKey = config.robloxApiKey;
    this.universeId = config.robloxUniverseId;
  }

  async getLeaderboard(kind: LeaderboardKind): Promise<LeaderboardEntry[]> {
    const dataStoreName = this.config.robloxDataStoreName;
    if (!dataStoreName) throw new Error("ROBLOX_DATASTORE_NAME is required");
    const url = new URL(
      `https://apis.roblox.com/datastores/v1/universes/${encodeURIComponent(this.universeId)}` +
        `/standard-datastores/datastore/entries/entry`,
    );
    url.searchParams.set("datastoreName", dataStoreName);
    url.searchParams.set("entryKey", kind);

    const data = await requestRobloxJson(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });
    return parseLeaderboard(data);
  }
}
