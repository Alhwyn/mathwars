import { waitUntil } from "@vercel/functions";
import { EmbedBuilder, REST, Routes } from "discord.js";
import nacl from "tweetnacl";
import { publishLeaderboard, cloudConfig } from "./daily.js";
import { loadConfig, type Config } from "../src/config.js";
import { safeErrorMessage } from "../src/logging.js";
import { RobloxProvider } from "../src/data/robloxProvider.js";
import type { LeaderboardEntry } from "../src/data/provider.js";
import { StubProvider } from "../src/data/stubProvider.js";
import { getAvatarHeadshot, resolveUsername } from "../src/roblox/users.js";
import { isRecord, safeDiscordName } from "../src/utils.js";
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

async function dismiss(config: Config, applicationId: string, token: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.delete(Routes.webhookMessage(applicationId, token, "@original"));
}

async function followUp(config: Config, applicationId: string, token: string, body: Record<string, unknown>): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.patch(Routes.webhookMessage(applicationId, token, "@original"), { body });
}

function summary(entries: LeaderboardEntry[], userId: number, topSize: number): string {
  const index = entries.findIndex((entry) => entry.userId === userId);
  const entry = entries[index];
  if (index >= 0 && index < topSize && entry) return `**Rank:** #${index + 1}\n**Score:** ${entry.score.toLocaleString("en-US")}`;
  if (entry) return `**Rank:** #${index + 1}\n**Score:** ${entry.score.toLocaleString("en-US")}`;
  return entries.length === 0 ? "No score record found" : `**Rank:** outside top ${topSize}\n**Score:** no score record found`;
}

async function leaderboardReply(config: Config, username: string, userId: string): Promise<Record<string, unknown> | null> {
  const provider = config.dataProvider === "roblox" ? new RobloxProvider(config) : new StubProvider();
  const account = await resolveUsername(username.trim());
  if (!account) return { content: `Roblox user "${username.trim()}" was not found.` };
  const [kills, wins] = await Promise.all([provider.getLeaderboard("kills"), provider.getLeaderboard("wins")]);
  if (kills.length === 0 && wins.length === 0) return null;
  const avatar = await getAvatarHeadshot(account.id).catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${account.displayName} (@${account.name})` })
    .setTitle("Roblox leaderboard")
    .setURL(`https://www.roblox.com/users/${account.id}/profile`)
    .addFields(
      { name: "⚔️ Kills", value: summary(kills, account.id, config.topSize) },
      { name: "🏆 Wins", value: summary(wins, account.id, config.topSize) },
    )
    .setFooter({ text: "Roblox profile" });
  if (avatar) embed.setThumbnail(avatar);
  return {
    embeds: [embed.toJSON()],
    components: [
      {
        type: 1,
        components: [{ type: 2, style: 2, label: "Close", emoji: { name: "✖️" }, custom_id: `leaderboard:${userId}:close` }],
      },
    ],
  };
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
      `Daily update: ${config.updateHourUtc}:00 UTC in <#${config.leaderboardChannelId}>`,
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
  const user = (member && isRecord(member.user) ? member.user : undefined) ?? (isRecord(body.user) ? body.user : undefined);
  const userId = user && typeof user.id === "string" ? user.id : "";
  const name = member && typeof member.nick === "string" && member.nick ? member.nick : user && typeof user.global_name === "string" ? user.global_name : user && typeof user.username === "string" ? user.username : "Someone";

  if (body.type === 3 && typeof body.data.custom_id === "string") {
    const owner = /^leaderboard:(\d{1,20}):close$/.exec(body.data.custom_id)?.[1];
    if (!owner) return Response.json({ type: 6 });
    if (owner !== userId) {
      return Response.json({ type: 4, data: { content: "Only the person who ran this command can use these buttons.", flags: ephemeral } });
    }
    const safe = safeDiscordName(name);
    return Response.json({
      type: 7,
      data: { content: `**${safe} closed the leaderboard.**`, embeds: [], components: [], allowed_mentions: { parse: [] } },
    });
  }

  if (body.type !== 2 || typeof body.data.name !== "string") return new Response(null, { status: 400 });
  const command = body.data.name;
  const options: Record<string, string> = {};
  if (Array.isArray(body.data.options)) {
    for (const option of body.data.options) {
      if (isRecord(option) && typeof option.name === "string" && typeof option.value === "string") options[option.name] = option.value;
    }
  }
  const token = body.token;
  const applicationId = body.application_id;
  const permissions = member && typeof member.permissions === "string" ? member.permissions : "0";

  waitUntil(
    (async () => {
      try {
        if (command === "refresh") {
          const admin = (BigInt(permissions) & 8n) === 8n;
          await followUp(config, applicationId, token, {
            content: admin ? await publishLeaderboard(config) : "Only server administrators can refresh the leaderboard.",
          });
          return;
        }
        if (command === "status") {
          await followUp(config, applicationId, token, await statusReply(config));
          return;
        }
        if (command === "leaderboard") {
          const reply = await leaderboardReply(config, options.roblox_username ?? "", userId);
          if (!reply) {
            await dismiss(config, applicationId, token);
            return;
          }
          await followUp(config, applicationId, token, reply);
          return;
        }
        await dismiss(config, applicationId, token);
      } catch (error) {
        console.error(safeErrorMessage(error, config));
        await dismiss(config, applicationId, token).catch((dismissError: unknown) => {
          console.error(safeErrorMessage(dismissError, config));
        });
      }
    })(),
  );

  return Response.json({
    type: 5,
    ...(command === "refresh" || command === "status" ? { data: { flags: ephemeral } } : {}),
  });
}
