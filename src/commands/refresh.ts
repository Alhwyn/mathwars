import { PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type Client } from "discord.js";
import type { Config, DataProvider } from "../types.js";
import { logError } from "../logging.js";
import { postDailyUpdate } from "../jobs/dailyUpdate.js";

export const refreshCommand = new SlashCommandBuilder()
  .setName("refresh")
  .setDescription("Refresh and post the leaderboard now")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function executeRefresh(
  interaction: ChatInputCommandInteraction,
  client: Client,
  provider: DataProvider,
  config: Config,
): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Only server administrators can refresh the leaderboard.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    await postDailyUpdate(client, provider, config);
    await interaction.editReply("Leaderboard refreshed.");
  } catch (error) {
    await logError(client, config, "Manual leaderboard refresh", error);
    await interaction.deleteReply().catch(() => undefined);
  }
}
