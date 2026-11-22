export interface Config {
  discordToken: string;
  discordClientId: string;
  leaderboardChannelId: string;
  dataProvider: "roblox";
  robloxApiKey?: string;
  robloxUniverseId?: string;
  robloxKillsDataStore?: string;
  robloxWinsDataStore?: string;
  updateHourUtc: number;
  updateWeekdayUtc: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  topSize: number;
  snapshotPath: string;
}

export interface LeaderboardEntry {
  userId: number;
  username: string;
  score: number;
}

export type LeaderboardKind = "kills" | "wins";

export interface DataProvider {
  getLeaderboard(kind: LeaderboardKind): Promise<LeaderboardEntry[]>;
  getScore(kind: LeaderboardKind, userId: number): Promise<number | null>;
}

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
}

export interface SnapshotLeaderboard {
  updatedAt: string;
  entries: LeaderboardEntry[];
}

export interface Snapshot {
  leaderboards: Partial<Record<LeaderboardKind, SnapshotLeaderboard>>;
  messageId?: string;
  lastPostedAt?: string;
}
