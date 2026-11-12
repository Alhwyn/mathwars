import "dotenv/config";

export interface Config {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  leaderboardChannelId?: string;
  logChannelId?: string;
  dataProvider: "stub" | "roblox";
  robloxDataStoreMode: "standard" | "ordered";
  robloxApiKey?: string;
  robloxUniverseId?: string;
  robloxDataStoreName?: string;
  robloxKillsDataStoreName?: string;
  robloxWinsDataStoreName?: string;
  robloxKillsEntryKey: string;
  robloxWinsEntryKey: string;
  updateHourUtc: number;
  topSize: number;
  snapshotPath: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function loadConfig(): Config {
  const dataProvider = process.env.DATA_PROVIDER?.trim().toLowerCase() || "stub";
  if (dataProvider !== "stub" && dataProvider !== "roblox") {
    throw new Error('DATA_PROVIDER must be either "stub" or "roblox"');
  }
  const robloxDataStoreMode = process.env.ROBLOX_DATASTORE_MODE?.trim().toLowerCase() || "standard";
  if (robloxDataStoreMode !== "standard" && robloxDataStoreMode !== "ordered") {
    throw new Error('ROBLOX_DATASTORE_MODE must be either "standard" or "ordered"');
  }

  const config: Config = {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    discordGuildId: optional("DISCORD_GUILD_ID"),
    leaderboardChannelId: optional("LEADERBOARD_CHANNEL_ID"),
    logChannelId: optional("LOG_CHANNEL_ID"),
    dataProvider,
    robloxDataStoreMode,
    robloxDataStoreName: optional("ROBLOX_DATASTORE_NAME"),
    robloxKillsDataStoreName: optional("ROBLOX_KILLS_DATASTORE_NAME"),
    robloxWinsDataStoreName: optional("ROBLOX_WINS_DATASTORE_NAME"),
    robloxKillsEntryKey:
      optional("ROBLOX_KILLS_ENTRY_KEY") ?? optional("ROBLOX_ENTRY_KEY") ?? "kills",
    robloxWinsEntryKey: optional("ROBLOX_WINS_ENTRY_KEY") ?? "wins",
    updateHourUtc: integer("UPDATE_HOUR_UTC", 8, 0, 23),
    topSize: integer("LEADERBOARD_TOP_SIZE", 10, 1, 10),
    snapshotPath: optional("SNAPSHOT_PATH") ?? "./snapshot.json",
  };

  if (dataProvider === "roblox") {
    config.robloxApiKey = required("ROBLOX_API_KEY");
    config.robloxUniverseId = required("ROBLOX_UNIVERSE_ID");
    if (
      robloxDataStoreMode === "ordered" &&
      (!config.robloxKillsDataStoreName || !config.robloxWinsDataStoreName)
    ) {
      throw new Error(
        "Set both ROBLOX_KILLS_DATASTORE_NAME and ROBLOX_WINS_DATASTORE_NAME for ordered DataStores",
      );
    }
    if (
      robloxDataStoreMode === "standard" &&
      !config.robloxDataStoreName &&
      (!config.robloxKillsDataStoreName || !config.robloxWinsDataStoreName)
    ) {
      throw new Error(
        "Set ROBLOX_DATASTORE_NAME or both ROBLOX_KILLS_DATASTORE_NAME and ROBLOX_WINS_DATASTORE_NAME",
      );
    }
  }

  return config;
}
