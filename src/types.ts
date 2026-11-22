export interface Config {
  discordToken: string;
  discordClientId: string;
  leaderboardChannelId: string;
  dataProvider: "stub" | "roblox";
  robloxApiKey?: string;
  robloxUniverseId?: string;
  robloxDataStoreName?: string;
  updateHourUtc: number;
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
