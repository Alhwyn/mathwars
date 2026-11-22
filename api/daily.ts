import { readFile, rm, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { BlobNotFoundError, get, put } from "@vercel/blob";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import { leaderboardCommand } from "../src/commands/leaderboard.js";
import { refreshCommand } from "../src/commands/refresh.js";
import { statusCommand } from "../src/commands/status.js";
import { loadConfig } from "../src/config.js";
import type { Config } from "../src/types.js";
import { RobloxProvider } from "../src/data/robloxProvider.js";
import { StubProvider } from "../src/data/stubProvider.js";
import { postDailyUpdate } from "../src/jobs/dailyUpdate.js";
import { readSnapshot } from "../src/storage/snapshot.js";
import { safeErrorMessage } from "../src/logging.js";

const blobPath = "leaderbot/snapshot.json";
const tempSnapshot = "/tmp/leaderbot-snapshot.json";
const twelveHours = 12 * 60 * 60 * 1000;

function provider(config: Config) {
  return config.dataProvider === "roblox" ? new RobloxProvider(config) : new StubProvider();
}

export async function cloudConfig(config: Config): Promise<Config> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (process.env.VERCEL) throw new Error("BLOB_READ_WRITE_TOKEN is required on Vercel");
    return config;
  }
  await rm(tempSnapshot, { force: true });
  try {
    const result = await get(blobPath, { access: "private", useCache: false });
    if (result?.statusCode === 200) {
      await writeFile(tempSnapshot, await new Response(result.stream).text());
    }
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }
  return { ...config, snapshotPath: tempSnapshot };
}

async function saveCloud(config: Config): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  await put(blobPath, await readFile(config.snapshotPath), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function publishLeaderboard(config: Config): Promise<string> {
  const stored = await cloudConfig(config);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(stored.discordToken);
    const unavailable = await postDailyUpdate(client, provider(stored), stored);
    await saveCloud(stored);
    if (unavailable.length > 0) console.error(`Leaderboard data was unavailable for ${unavailable.join(" and ")}`);
    return "Leaderboard refreshed.";
  } finally {
    client.destroy();
  }
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const config = loadConfig();
    const rest = new REST({ version: "10" }).setToken(config.discordToken);
    await rest.put(Routes.applicationCommands(config.discordClientId), { body: [leaderboardCommand.toJSON(), refreshCommand.toJSON(), statusCommand.toJSON()] });

    const stored = await cloudConfig(config);
    const snapshot = await readSnapshot(stored.snapshotPath);
    const postedAt = snapshot?.lastPostedAt ? Date.parse(snapshot.lastPostedAt) : Number.NaN;
    if (Number.isFinite(postedAt) && Date.now() - postedAt < twelveHours) {
      return Response.json({ ok: true, skipped: true });
    }
    return Response.json({ ok: true, message: await publishLeaderboard(stored) });
  } catch (error) {
    console.error(safeErrorMessage(error));
    return new Response(null, { status: 500 });
  }
}
