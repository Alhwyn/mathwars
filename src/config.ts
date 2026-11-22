import "dotenv/config";
import type { Config } from "./types.js";
import { required } from "./utils.js";

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function weeklyUpdateLabel(config: Config): string {
  return `${weekdayNames[config.updateWeekdayUtc]} ${config.updateHourUtc}:00 UTC`;
}

export function loadConfig(): Config {
  const config: Config = {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    leaderboardChannelId: required("LEADERBOARD_CHANNEL_ID"),
    dataProvider: "roblox",
    updateHourUtc: 8,
    updateWeekdayUtc: 0,
    topSize: 10,
    snapshotPath: "./snapshot.json",
    // Real Roblox data only. There is no sample/fake fallback.
    robloxApiKey: required("ROBLOX_API_KEY"),
    robloxUniverseId: required("ROBLOX_UNIVERSE_ID"),
    robloxKillsDataStore: required("ROBLOX_KILLS_DATASTORE"),
    robloxWinsDataStore: required("ROBLOX_WINS_DATASTORE"),
  };

  return config;
}
