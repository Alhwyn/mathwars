import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type Interaction,
} from "discord.js";
import { executeLeaderboard, leaderboardCommand } from "./commands/leaderboard.js";
import { executeRefresh, refreshCommand } from "./commands/refresh.js";
import { executeStatus, statusCommand } from "./commands/status.js";
import { loadConfig } from "./config.js";
import { RobloxProvider } from "./data/robloxProvider.js";
import type { DataProvider } from "./data/provider.js";
import { StubProvider } from "./data/stubProvider.js";
import { scheduleDailyUpdate } from "./jobs/dailyUpdate.js";
import { logError, safeErrorMessage } from "./logging.js";

async function registerCommands(config: ReturnType<typeof loadConfig>): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);
  await rest.put(route, {
    body: [leaderboardCommand.toJSON(), refreshCommand.toJSON(), statusCommand.toJSON()],
  });
}

let activeConfig: ReturnType<typeof loadConfig> | undefined;

async function main(): Promise<void> {
  const config = loadConfig();
  activeConfig = config;
  const provider: DataProvider =
    config.dataProvider === "roblox" ? new RobloxProvider(config) : new StubProvider();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });

  client.once("clientReady", () => {
    console.log(`Logged in as ${client.user?.tag ?? "unknown user"}`);
    if (config.leaderboardChannelId) {
      scheduleDailyUpdate(client, provider, config);
      console.log(`Daily update scheduled for ${config.updateHourUtc}:00 UTC`);
    } else {
      console.warn("Daily updates are disabled: LEADERBOARD_CHANNEL_ID is not configured");
    }
  });

  client.on("interactionCreate", (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (config.discordGuildId && interaction.guildId !== config.discordGuildId) {
      void interaction
        .reply({ content: "This bot is not available in this server.", ephemeral: true })
        .catch((error: unknown) => {
          void logError(client, config, "Foreign server command", error);
        });
      return;
    }
    if (interaction.commandName === "leaderboard") {
      void executeLeaderboard(interaction, provider, client, config).catch(async (error: unknown) => {
        await logError(client, config, "Leaderboard command", error);
        try {
          const message = "Could not load the leaderboard. Please try again later.";
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(message);
          } else {
            await interaction.reply({ content: message, ephemeral: true });
          }
        } catch (replyError) {
          await logError(client, config, "Leaderboard error response", replyError);
        }
      });
    } else if (interaction.commandName === "refresh") {
      void executeRefresh(interaction, client, provider, config).catch(async (error: unknown) => {
        await logError(client, config, "Refresh command", error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("The leaderboard could not be refreshed.");
          } else {
            await interaction.reply({ content: "The leaderboard could not be refreshed.", ephemeral: true });
          }
        } catch (replyError) {
          await logError(client, config, "Refresh error response", replyError);
        }
      });
    } else if (interaction.commandName === "status") {
      void executeStatus(interaction, client, config).catch(async (error: unknown) => {
        await logError(client, config, "Status command", error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply("Could not load bot status.");
          } else {
            await interaction.reply({ content: "Could not load bot status.", ephemeral: true });
          }
        } catch (replyError) {
          await logError(client, config, "Status error response", replyError);
        }
      });
    }
  });

  await client.login(config.discordToken);
  try {
    await registerCommands(config);
  } catch (error) {
    console.error(
      "Could not register slash commands. Check that DISCORD_CLIENT_ID matches this bot's application and that the bot is invited to DISCORD_GUILD_ID.",
      safeErrorMessage(error, config),
    );
  }
}

main().catch((error: unknown) => {
  console.error("Bot startup failed:", safeErrorMessage(error, activeConfig));
  process.exitCode = 1;
});
