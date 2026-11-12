export interface LeaderboardEntry {
  userId: number;
  username: string;
  score: number;
}

export type LeaderboardKind = "kills" | "wins";

export interface DataProvider {
  getLeaderboard(kind: LeaderboardKind): Promise<LeaderboardEntry[]>;
}
