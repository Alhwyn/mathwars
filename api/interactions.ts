import nacl from "tweetnacl";
import { publishLeaderboard, cloudConfig } from "./weekly.js";
import { globalBoard, userCard } from "../src/commands/leaderboard.js";
import { loadConfig, weeklyUpdateLabel } from "../src/config.js";
import { safeErrorMessage } from "../src/logging.js";
import { RobloxProvider } from "../src/data/robloxProvider.js";
import type { Config } from "../src/types.js";
import { isRecord } from "../src/utils.js";
import { readSnapshot } from "../src/storage/snapshot.js";

const ephemeral = 1 << 6;

const maxBodyBytes = 64_000;
const maxSignatureAgeMs = 5 * 60 * 1000;

function verify(body: string, signature: string, timestamp: string, key: string): boolean {
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt * 1000) > maxSignatureAgeMs) return false;
  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      Buffer.from(signature, "hex"),
      Buffer.from(key, "hex"),
    );
  } catch {
    return false;
  }
}

function unauthorized(): Response {
  return new Response("invalid request signature", { status: 401 });
}

function commandReply(data: object, hidden = false): Response {
  return Response.json({
    type: 4,
    data: hidden ? { ...data, flags: ephemeral } : data,
  });
}

async function statusReply(config: Config): Promise<Record<string, unknown>> {
  const stored = await cloudConfig(config);
  const snapshot = await readSnapshot(stored.snapshotPath);
  const stamps = [snapshot?.lastPostedAt, snapshot?.leaderboards.kills?.updatedAt, snapshot?.leaderboards.wins?.updatedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  const latest = stamps.sort((a, b) => b - a)[0];
  return {
    content: [
      "**Bot status**",
      `Data source: ${config.dataProvider}`,
      `Weekly update: ${weeklyUpdateLabel(config)} in <#${config.leaderboardChannelId}>`,
      `Last leaderboard update: ${latest === undefined ? "No saved update" : `<t:${Math.floor(latest / 1000)}:R>`}`,
    ].join("\n"),
  };
}

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleInteraction(request);
  } catch (error) {
    console.error(safeErrorMessage(error));
    return new Response(null, { status: 500 });
  }
}

async function handleInteraction(request: Request): Promise<Response> {
  const key = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!key) return unauthorized();
  const raw = await request.text();
  if (raw.length === 0 || raw.length > maxBodyBytes) return unauthorized();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!signature || !timestamp || !verify(raw, signature, timestamp, key)) return unauthorized();

  const config = loadConfig();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isRecord(parsed) || typeof parsed.type !== "number") return new Response(null, { status: 400 });
  const body = parsed;
  if (body.type === 1) return Response.json({ type: 1 });
  if (!isRecord(body.data) || typeof body.token !== "string" || typeof body.application_id !== "string") {
    return new Response(null, { status: 400 });
  }

  const member = isRecord(body.member) ? body.member : undefined;
  if (body.type === 3) return Response.json({ type: 6 });
  if (body.type !== 2 || typeof body.data.name !== "string") return new Response(null, { status: 400 });
  const command = body.data.name;
  const options: Record<string, string> = {};
  if (Array.isArray(body.data.options)) {
    for (const option of body.data.options) {
      if (isRecord(option) && typeof option.name === "string" && typeof option.value === "string") options[option.name] = option.value;
    }
  }
  const permissions = member && typeof member.permissions === "string" ? member.permissions : "0";

  if (command === "refresh") {
    const admin = (BigInt(permissions) & 8n) === 8n;
    if (!admin) {
      return commandReply({ content: "Only server administrators can refresh the leaderboard." }, true);
    }
    return commandReply({ content: await publishLeaderboard(config) }, true);
  }
  if (command === "status") return commandReply(await statusReply(config), true);
  if (command !== "global" && command !== "user") return new Response(null, { status: 204 });
  const provider = new RobloxProvider(config);
  return commandReply(
    command === "global"
      ? await globalBoard(provider, config.topSize)
      : await userCard(provider, options.roblox_username ?? ""),
  );
}
