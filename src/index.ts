import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type Interaction,
} from "discord.js";
import { executeGlobal, executeUser, slashCommands } from "./commands/leaderboard.js";
import { executeRefresh } from "./commands/refresh.js";
import { executeStatus } from "./commands/status.js";
import { loadConfig, weeklyUpdateLabel } from "./config.js";
import { RobloxProvider } from "./data/robloxProvider.js";
import type { DataProvider } from "./types.js";
import { scheduleDailyUpdate } from "./jobs/dailyUpdate.js";
import { logError, safeErrorMessage } from "./logging.js";

async function registerCommands(config: ReturnType<typeof loadConfig>): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: slashCommands.map((command) => command.toJSON()),
  });
}

let activeConfig: ReturnType<typeof loadConfig> | undefined;

async function main(): Promise<void> {
  const config = loadConfig();
  activeConfig = config;
  const provider: DataProvider =
    new RobloxProvider(config);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("clientReady", () => {
    console.log(`Logged in as ${client.user?.tag ?? "unknown user"}`);
    scheduleDailyUpdate(client, provider, config);
    console.log(`Weekly update scheduled for ${weeklyUpdateLabel(config)}`);
  });

  client.on("interactionCreate", (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.commandName;
    const run =
      command === "global" ? executeGlobal(interaction, provider, config)
      : command === "user" ? executeUser(interaction, provider)
      : command === "refresh" ? executeRefresh(interaction, client, provider, config)
      : command === "status" ? executeStatus(interaction, client, config)
      : undefined;
    if (!run) return;
    void run.catch(async (error: unknown) => {
      await logError(client, config, command, error);
      if (interaction.deferred || interaction.replied) {
        await interaction.deleteReply().catch(() => undefined);
      }
    });
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
