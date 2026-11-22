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
import type { DataProvider } from "./types.js";
import { StubProvider } from "./data/stubProvider.js";
import { scheduleDailyUpdate } from "./jobs/dailyUpdate.js";
import { logError, safeErrorMessage } from "./logging.js";

async function registerCommands(config: ReturnType<typeof loadConfig>): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: [leaderboardCommand.toJSON(), refreshCommand.toJSON(), statusCommand.toJSON()],
  });
}

let activeConfig: ReturnType<typeof loadConfig> | undefined;

async function main(): Promise<void> {
  const config = loadConfig();
  activeConfig = config;
  const provider: DataProvider =
    config.dataProvider === "roblox" ? new RobloxProvider(config) : new StubProvider();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("clientReady", () => {
    console.log(`Logged in as ${client.user?.tag ?? "unknown user"}`);
    scheduleDailyUpdate(client, provider, config);
    console.log(`Daily update scheduled for ${config.updateHourUtc}:00 UTC`);
  });

  client.on("interactionCreate", (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "leaderboard") {
      void executeLeaderboard(interaction, provider, client, config).catch(async (error: unknown) => {
        await logError(client, config, "Leaderboard command", error);
        if (interaction.deferred || interaction.replied) {
          await interaction.deleteReply().catch(() => undefined);
        }
      });
    } else if (interaction.commandName === "refresh") {
      void executeRefresh(interaction, client, provider, config).catch(async (error: unknown) => {
        await logError(client, config, "Refresh command", error);
        if (interaction.deferred || interaction.replied) {
          await interaction.deleteReply().catch(() => undefined);
        }
      });
    } else if (interaction.commandName === "status") {
      void executeStatus(interaction, client, config).catch(async (error: unknown) => {
        await logError(client, config, "Status command", error);
        if (interaction.deferred || interaction.replied) {
          await interaction.deleteReply().catch(() => undefined);
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
