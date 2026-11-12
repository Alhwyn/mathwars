import { ChannelType, type Client, type TextChannel } from "discord.js";
import type { Config } from "../config.js";
import type { DataProvider, LeaderboardEntry, LeaderboardKind } from "../data/provider.js";
import { renderDailyChanges, renderDailyLeaderboard } from "../format/render.js";
import { logError } from "../logging.js";
import { readSnapshot, writeSnapshot, type Snapshot } from "../storage/snapshot.js";

const leaderboardMarker = "||leaderbot:daily-leaderboard||";
const kinds: LeaderboardKind[] = ["kills", "wins"];
const minimumUpdateIntervalMs = 24 * 60 * 60 * 1000;
let updateInProgress = false;

async function findPinnedLeaderboard(channel: TextChannel, botUserId: string, messageId?: string) {
  const pinned = await channel.messages.fetchPinned();
  return (
    pinned.find((message) => message.id === messageId && message.author.id === botUserId) ??
    pinned.find(
      (message) => message.author.id === botUserId && message.content.includes(leaderboardMarker),
    )
  );
}

export async function postDailyUpdate(
  client: Client,
  provider: DataProvider,
  config: Config,
): Promise<LeaderboardKind[]> {
  if (updateInProgress) throw new Error("A leaderboard update is already in progress");
  updateInProgress = true;
  try {
    if (!config.leaderboardChannelId) {
      throw new Error("LEADERBOARD_CHANNEL_ID is required to post daily updates");
    }

    const channel = await client.channels.fetch(config.leaderboardChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`LEADERBOARD_CHANNEL_ID is not a text channel: ${config.leaderboardChannelId}`);
    }

    const previous = await readSnapshot(config.snapshotPath);
    const updatedBoards: Partial<Record<LeaderboardKind, LeaderboardEntry[]>> = {};
    const failures = new Set<LeaderboardKind>();
    await Promise.all(
      kinds.map(async (kind) => {
        try {
          updatedBoards[kind] = await provider.getLeaderboard(kind);
        } catch (error) {
          failures.add(kind);
          await logError(client, config, `Daily ${kind} update`, error);
        }
      }),
    );

    const updatedAt = new Date();
    const nextSnapshot: Snapshot = {
      leaderboards: { ...previous?.leaderboards },
      ...(previous?.messageId ? { messageId: previous.messageId } : {}),
    };
    for (const kind of kinds) {
      const entries = updatedBoards[kind];
      if (entries) {
        nextSnapshot.leaderboards[kind] = { updatedAt: updatedAt.toISOString(), entries };
      }
    }

    const staleAt: Partial<Record<LeaderboardKind, Date>> = {};
    for (const kind of failures) {
      const saved = previous?.leaderboards[kind];
      if (saved) staleAt[kind] = new Date(saved.updatedAt);
    }
    const content =
      `${leaderboardMarker}\n` +
      renderDailyLeaderboard(
        nextSnapshot.leaderboards.kills?.entries ?? [],
        nextSnapshot.leaderboards.wins?.entries ?? [],
        config.topSize,
        updatedAt,
        staleAt,
      );
    const botUser = client.user;
    if (!botUser) throw new Error("Cannot post a leaderboard before the bot is ready");
    const pinned = await findPinnedLeaderboard(channel, botUser.id, previous?.messageId);
    if (pinned) {
      await pinned.edit({ content });
      nextSnapshot.messageId = pinned.id;
    } else {
      const message = await channel.send({ content });
      await message.pin();
      nextSnapshot.messageId = message.id;
    }

    const previousEntries: Partial<Record<LeaderboardKind, LeaderboardEntry[]>> = {};
    const currentEntries: Partial<Record<LeaderboardKind, LeaderboardEntry[]>> = {};
    for (const kind of kinds) {
      previousEntries[kind] = previous?.leaderboards[kind]?.entries;
      currentEntries[kind] = nextSnapshot.leaderboards[kind]?.entries;
    }
    const priorDates = kinds
      .map((kind) => previous?.leaderboards[kind]?.updatedAt)
      .filter((date): date is string => date !== undefined)
      .map((date) => new Date(date))
      .filter((date) => Number.isFinite(date.getTime()));
    const previousUpdatedAt =
      priorDates.length > 0 ? new Date(Math.max(...priorDates.map((date) => date.getTime()))) : null;
    await channel.send({
      content: renderDailyChanges(
        previousEntries,
        currentEntries,
        config.topSize,
        previousUpdatedAt,
        updatedAt,
        failures,
      ),
    });
    nextSnapshot.lastPostedAt = new Date().toISOString();
    await writeSnapshot(config.snapshotPath, nextSnapshot);
    return kinds.filter((kind) => failures.has(kind));
  } finally {
    updateInProgress = false;
  }
}

export function scheduleDailyUpdate(
  client: Client,
  provider: DataProvider,
  config: Config,
): ReturnType<typeof setTimeout> {
  const checkForMissedUpdate = async (): Promise<void> => {
    const snapshot = await readSnapshot(config.snapshotPath);
    if (!snapshot) return;

    const previousUpdateTimes = kinds
      .map((kind) => snapshot.leaderboards[kind]?.updatedAt)
      .filter((date): date is string => date !== undefined)
      .map((date) => Date.parse(date))
      .filter(Number.isFinite);
    const lastPostedTime = snapshot.lastPostedAt
      ? Date.parse(snapshot.lastPostedAt)
      : Math.max(...previousUpdateTimes);
    if (!Number.isFinite(lastPostedTime) || Date.now() - lastPostedTime < minimumUpdateIntervalMs) {
      return;
    }

    console.log("The last leaderboard update was at least 24 hours ago; posting a catch-up update.");
    await postDailyUpdate(client, provider, config);
  };

  const scheduleNext = (): ReturnType<typeof setTimeout> => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(config.updateHourUtc, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);

    const timer = setTimeout(() => {
      void postDailyUpdate(client, provider, config)
        .catch((error: unknown) => logError(client, config, "Daily leaderboard update", error))
        .finally(() => {
          scheduleNext();
        });
    }, next.getTime() - now.getTime());
    timer.unref();
    return timer;
  };

  const timer = scheduleNext();
  void checkForMissedUpdate().catch((error: unknown) =>
    logError(client, config, "Missed leaderboard update check", error),
  );
  return timer;
}
