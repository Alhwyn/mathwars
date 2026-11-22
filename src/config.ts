import "dotenv/config";

export interface Config {
  discordToken: string;
  discordClientId: string;
  leaderboardChannelId: string;
  dataProvider: "stub" | "roblox";
  robloxApiKey?: string;
  robloxUniverseId?: string;
  robloxDataStoreName?: string;
  updateHourUtc: number;
  topSize: number;
  snapshotPath: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

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
