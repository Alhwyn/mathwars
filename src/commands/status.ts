import { SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import type { Config } from "../config.js";
import { logError } from "../logging.js";
import { readSnapshot } from "../storage/snapshot.js";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const MILLISECONDS_PER_SECOND = 1_000;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${days}d ${hours}h ${minutes}m`;
}

export const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show the bot's status");

export async function executeStatus(
  interaction: ChatInputCommandInteraction,
  client: Client,
  config: Config,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  let lastUpdate = "No saved update";
  try {
    const snapshot = await readSnapshot(config.snapshotPath);
    const timestamps = [
      snapshot?.lastPostedAt,
      snapshot?.leaderboards.kills?.updatedAt,
      snapshot?.leaderboards.wins?.updatedAt,
    ].filter((value): value is string => value !== undefined);
    const lastUpdateTime = timestamps
      .map((value) => Date.parse(value))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    if (lastUpdateTime !== undefined) {
      lastUpdate = `<t:${Math.floor(lastUpdateTime / MILLISECONDS_PER_SECOND)}:R>`;
    }
  } catch (error) {
    await logError(client, config, "Status snapshot lookup", error);
  }

  const botUser = client.user;
  await interaction.editReply(
    [
      "**Bot status**",
      `Bot: ${botUser ? `${botUser.tag} (${botUser.id})` : "not connected"}`,
      `Uptime: ${formatUptime(process.uptime())}`,
      `Discord latency: ${client.ws.ping >= 0 ? `${client.ws.ping} ms` : "unavailable"}`,
      `Servers connected: ${client.guilds.cache.size}`,
      `Data source: ${config.dataProvider}`,
      `Daily update: ${config.updateHourUtc}:00 UTC in <#${config.leaderboardChannelId}>`,
      `Last leaderboard update: ${lastUpdate}`,
    ].join("\n"),
  );
}
