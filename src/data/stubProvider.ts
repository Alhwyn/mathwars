import type { DataProvider, LeaderboardEntry } from "./provider.js";

const sampleKills: LeaderboardEntry[] = [
  { userId: 156, username: "Builderman", score: 12450 },
  { userId: 261, username: "AlexBuilder", score: 10820 },
  { userId: 1, username: "Roblox", score: 9750 },
  { userId: 2, username: "JohnDoe", score: 8120 },
  { userId: 3, username: "JaneDoe", score: 7600 },
];

const sampleWins: LeaderboardEntry[] = [
  { userId: 1, username: "Roblox", score: 320 },
  { userId: 156, username: "Builderman", score: 290 },
  { userId: 2, username: "JohnDoe", score: 245 },
  { userId: 261, username: "AlexBuilder", score: 210 },
  { userId: 3, username: "JaneDoe", score: 180 },
];

export class StubProvider implements DataProvider {
  async getLeaderboard(kind: "kills" | "wins"): Promise<LeaderboardEntry[]> {
    const entries = kind === "kills" ? sampleKills : sampleWins;
    return entries.map((entry) => ({ ...entry }));
  }
}
