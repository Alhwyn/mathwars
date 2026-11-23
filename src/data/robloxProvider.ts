import type { Config, DataProvider, LeaderboardEntry, LeaderboardKind } from "../types.js";
import { isRecord } from "../utils.js";
import { requestRobloxJson } from "../roblox/api.js";

// Reads the live Math Wars ordered DataStores (written by OlympiadScores.luau).
// Each entry key is a Roblox userId and its value is that player's best score.
export function parseOrderedEntries(value: unknown): { userId: number; score: number }[] {
  if (!isRecord(value)) throw new Error("Roblox ordered DataStore returned an invalid response");
  const entries = value.orderedDataStoreEntries ?? [];
  if (!Array.isArray(entries)) throw new Error("Roblox ordered DataStore returned an invalid response");
  return entries.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const userId = Number(entry.id);
    const score = Number(entry.value);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isFinite(score)) return [];
    return [{ userId, score }];
  });
}

async function usernames(userIds: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  if (userIds.length === 0) return names;
  const data = await requestRobloxJson(new URL("https://users.roblox.com/v1/users"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userIds, excludeBannedUsers: false }),
  });
  const users = isRecord(data) && Array.isArray(data.data) ? data.data : [];
  for (const user of users) {
    if (isRecord(user) && typeof user.id === "number" && typeof user.name === "string") names.set(user.id, user.name);
  }
  return names;
}

export class RobloxProvider implements DataProvider {
  private readonly apiKey: string;
  private readonly universeId: string;
  private readonly stores: Record<LeaderboardKind, string>;
  private readonly topSize: number;

  constructor(config: Config) {
    if (!config.robloxApiKey || !config.robloxUniverseId || !config.robloxKillsDataStore || !config.robloxWinsDataStore) {
      throw new Error("Roblox Open Cloud settings are missing");
    }
    this.apiKey = config.robloxApiKey;
    this.universeId = config.robloxUniverseId;
    this.stores = { kills: config.robloxKillsDataStore, wins: config.robloxWinsDataStore };
    this.topSize = config.topSize;
  }

  private orderedEntriesUrl(kind: LeaderboardKind, userId?: number): URL {
    const entry = userId === undefined ? "" : `/${encodeURIComponent(String(userId))}`;
    return new URL(
      `https://apis.roblox.com/cloud/v2/universes/${encodeURIComponent(this.universeId)}` +
        `/ordered-data-stores/${encodeURIComponent(this.stores[kind])}/scopes/global/entries${entry}`,
    );
  }

  private cloudGet(url: URL): Promise<unknown> {
    return requestRobloxJson(url, {
      headers: { "x-api-key": this.apiKey, Accept: "application/json" },
    });
  }

  async getLeaderboard(kind: LeaderboardKind): Promise<LeaderboardEntry[]> {
    const url = this.orderedEntriesUrl(kind);
    url.searchParams.set("maxPageSize", String(this.topSize));
    url.searchParams.set("orderBy", "value desc");
    const data = await this.cloudGet(url);
    const entries = parseOrderedEntries(data);
    const names = await usernames(entries.map((entry) => entry.userId));
    return entries
      .map((entry) => ({ userId: entry.userId, username: names.get(entry.userId) ?? `Player ${entry.userId}`, score: entry.score }))
      .sort((a, b) => b.score - a.score);
  }

  async getScore(kind: LeaderboardKind, userId: number): Promise<number | null> {
    try {
      const data = await this.cloudGet(this.orderedEntriesUrl(kind, userId));
      const score = Number(isRecord(data) ? data.value : Number.NaN);
      if (!Number.isFinite(score)) throw new Error("Roblox ordered DataStore returned an invalid entry");
      return score;
    } catch (error) {
      if (error instanceof Error && error.message.endsWith("(404)")) return null;
      throw error;
    }
  }
}
