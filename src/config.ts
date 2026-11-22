import "dotenv/config";
import type { Config } from "./types.js";
import { required } from "./utils.js";

export function loadConfig(): Config {
  const dataProvider = process.env.DATA_PROVIDER?.trim().toLowerCase() || "stub";
  if (dataProvider !== "stub" && dataProvider !== "roblox") {
    throw new Error('DATA_PROVIDER must be either "stub" or "roblox"');
  }

  const config: Config = {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    leaderboardChannelId: required("LEADERBOARD_CHANNEL_ID"),
    dataProvider,
    updateHourUtc: 8,
    topSize: 10,
    snapshotPath: "./snapshot.json",
  };

  if (dataProvider === "roblox") {
    config.robloxApiKey = required("ROBLOX_API_KEY");
    config.robloxUniverseId = required("ROBLOX_UNIVERSE_ID");
    config.robloxDataStoreName = required("ROBLOX_DATASTORE_NAME");
  }

  return config;
}
