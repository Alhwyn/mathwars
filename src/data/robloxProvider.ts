import type { Config } from "../config.js";
import { requestRobloxJson } from "../roblox/api.js";
import { resolveUsernames } from "../roblox/users.js";
import type { DataProvider, LeaderboardEntry, LeaderboardKind } from "./provider.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function parseOrderedEntries(value: unknown): Array<{ userId: number; score: number }> {
  if (!isRecord(value) || !Array.isArray(value.orderedDataStoreEntries)) {
    throw new Error("Roblox ordered DataStore response does not contain orderedDataStoreEntries");
  }

  const entries = value.orderedDataStoreEntries.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Invalid ordered leaderboard entry at index ${index}`);
    const userId = typeof item.id === "string" ? Number(item.id) : Number.NaN;
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      typeof item.value !== "number" ||
      !Number.isFinite(item.value)
    ) {
      throw new Error(`Invalid ordered leaderboard entry at index ${index}`);
    }
    return { userId, score: item.value };
  });

  const seenUserIds = new Set<number>();
  for (const entry of entries) {
    if (seenUserIds.has(entry.userId)) {
      throw new Error(`Duplicate Roblox userId in ordered leaderboard: ${entry.userId}`);
    }
    seenUserIds.add(entry.userId);
  }
  return entries;
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
    if (this.config.robloxDataStoreMode === "ordered") {
      return this.getOrderedLeaderboard(kind);
    }

    const dataStoreName =
      kind === "kills"
        ? this.config.robloxKillsDataStoreName ?? this.config.robloxDataStoreName
        : this.config.robloxWinsDataStoreName ?? this.config.robloxDataStoreName;
    if (!dataStoreName) {
      throw new Error(`Roblox DataStore is not configured for ${kind}`);
    }
    const entryKey = kind === "kills" ? this.config.robloxKillsEntryKey : this.config.robloxWinsEntryKey;
    const url = new URL(
      `https://apis.roblox.com/datastores/v1/universes/${encodeURIComponent(this.universeId)}` +
        `/standard-datastores/datastore/entries/entry`,
    );
    url.searchParams.set("datastoreName", dataStoreName);
    url.searchParams.set("entryKey", entryKey);

    const data = await requestRobloxJson(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });
    return parseLeaderboard(data);
  }

  private async getOrderedLeaderboard(kind: LeaderboardKind): Promise<LeaderboardEntry[]> {
    const dataStoreName =
      kind === "kills"
        ? this.config.robloxKillsDataStoreName
        : this.config.robloxWinsDataStoreName;
    if (!dataStoreName) {
      throw new Error(`Roblox ordered DataStore is not configured for ${kind}`);
    }

    const url = new URL(
      `https://apis.roblox.com/cloud/v2/universes/${encodeURIComponent(this.universeId)}` +
        `/ordered-data-stores/${encodeURIComponent(dataStoreName)}/scopes/global/entries`,
    );
    url.searchParams.set("maxPageSize", String(this.config.topSize));
    url.searchParams.set("orderBy", "value desc");

    const data = await requestRobloxJson(url, {
      headers: {
        "x-api-key": this.apiKey,
        Accept: "application/json",
      },
    });
    const scores = parseOrderedEntries(data);
    const usernames = await resolveUsernames(scores.map((entry) => entry.userId));
    return scores.map(({ userId, score }) => ({
      userId,
      username: usernames.get(userId) ?? `User ${userId}`,
      score,
    }));
  }
}
