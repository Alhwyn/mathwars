import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LeaderboardEntry, LeaderboardKind } from "../data/provider.js";

export interface SnapshotLeaderboard {
  updatedAt: string;
  entries: LeaderboardEntry[];
}

export interface Snapshot {
  leaderboards: Partial<Record<LeaderboardKind, SnapshotLeaderboard>>;
  messageId?: string;
  lastPostedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntries(value: unknown): LeaderboardEntry[] {
  if (!Array.isArray(value)) throw new Error("Snapshot leaderboard entries must be an array");

  return value.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.userId !== "number" ||
      !Number.isSafeInteger(item.userId) ||
      typeof item.username !== "string" ||
      typeof item.score !== "number" ||
      !Number.isFinite(item.score)
    ) {
      throw new Error(`Snapshot leaderboard entry ${index} is invalid`);
    }
    return { userId: item.userId, username: item.username, score: item.score };
  });
}

export async function readSnapshot(path: string): Promise<Snapshot | null> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`Snapshot file contains invalid JSON: ${path}`, { cause: error });
  }
  if (!isRecord(value)) throw new Error(`Snapshot file has an invalid format: ${path}`);

  const leaderboards: Snapshot["leaderboards"] = {};
  if (isRecord(value.leaderboards)) {
    for (const kind of ["kills", "wins"] as const) {
      const saved = value.leaderboards[kind];
      if (saved === undefined) continue;
      if (!isRecord(saved) || typeof saved.updatedAt !== "string") {
        throw new Error(`Snapshot ${kind} leaderboard has an invalid format`);
      }
      leaderboards[kind] = { updatedAt: saved.updatedAt, entries: parseEntries(saved.entries) };
    }
  } else if (typeof value.updatedAt === "string" && Array.isArray(value.entries)) {
    leaderboards.kills = { updatedAt: value.updatedAt, entries: parseEntries(value.entries) };
  } else {
    throw new Error(`Snapshot file has an invalid format: ${path}`);
  }

  return {
    leaderboards,
    ...(typeof value.messageId === "string" ? { messageId: value.messageId } : {}),
    ...(typeof value.lastPostedAt === "string" ? { lastPostedAt: value.lastPostedAt } : {}),
  };
}

export async function writeSnapshot(path: string, snapshot: Snapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
