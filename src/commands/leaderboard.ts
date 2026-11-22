import { SlashCommandBuilder, type APIEmbed, type ChatInputCommandInteraction } from "discord.js";
import type { Config, DataProvider } from "../types.js";
import { renderDailyLeaderboard } from "../format/render.js";
import { getAvatarHeadshot, resolveUsername } from "../roblox/users.js";
import { refreshCommand } from "./refresh.js";
import { statusCommand } from "./status.js";

type Reply = { content: string } | { embeds: APIEmbed[] };

export const globalCommand = new SlashCommandBuilder()
  .setName("global")
  .setDescription("Show the global leaderboard");

export const userCommand = new SlashCommandBuilder()
  .setName("user")
  .setDescription("Show one Roblox player's kills and wins")
  .addStringOption((option) =>
    option.setName("roblox_username").setDescription("Roblox username").setRequired(true).setMaxLength(20),
  );

export const slashCommands = [globalCommand, userCommand, refreshCommand, statusCommand];

export async function globalBoard(provider: DataProvider, topSize: number): Promise<Reply> {
  const [kills, wins] = await Promise.all([
    provider.getLeaderboard("kills"),
    provider.getLeaderboard("wins"),
  ]);
  return { content: renderDailyLeaderboard(kills, wins, topSize, new Date()) };
}

function scoreText(score: number | null): string {
  return score === null ? "No score" : score.toLocaleString("en-US");
}

export async function userCard(provider: DataProvider, username: string): Promise<Reply> {
  const name = username.trim();
  const account = await resolveUsername(name);
  if (!account) return { content: `Roblox user "${name}" was not found.` };

  const [kills, wins, avatar] = await Promise.all([
    provider.getScore("kills", account.id),
    provider.getScore("wins", account.id),
    getAvatarHeadshot(account.id).catch(() => null),
  ]);
  const embed: APIEmbed = {
    color: 0x5865f2,
    author: {
      name: `${account.displayName} (@${account.name})`,
      url: `https://www.roblox.com/users/${account.id}/profile`,
    },
    fields: [
      { name: "⚔️ Kills", value: scoreText(kills), inline: true },
      { name: "🏆 Wins", value: scoreText(wins), inline: true },
    ],
  };
  if (avatar) embed.thumbnail = { url: avatar };
  return { embeds: [embed] };
}

export async function executeGlobal(
  interaction: ChatInputCommandInteraction,
  provider: DataProvider,
  config: Config,
): Promise<void> {
  await interaction.reply(await globalBoard(provider, config.topSize));
}

export async function executeUser(
  interaction: ChatInputCommandInteraction,
  provider: DataProvider,
): Promise<void> {
  await interaction.reply(await userCard(provider, interaction.options.getString("roblox_username", true)));
}
