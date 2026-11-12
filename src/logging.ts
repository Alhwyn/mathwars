import { ChannelType, type Client } from "discord.js";
import type { Config } from "./config.js";

export function safeErrorMessage(error: unknown, config?: Config): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const secrets = [config?.discordToken, config?.robloxApiKey].filter(
    (secret): secret is string => Boolean(secret),
  );
  return secrets.reduce((safe, secret) => safe.replaceAll(secret, "[REDACTED]"), message);
}

export async function logError(
  client: Client,
  config: Config,
  context: string,
  error: unknown,
): Promise<void> {
  const message = safeErrorMessage(error, config);
  console.error(`[${context}] ${message}`);
  if (!config.logChannelId) return;

  try {
    const channel = await client.channels.fetch(config.logChannelId);
    if (channel?.type === ChannelType.GuildText) {
      await channel.send(`**${context}**: ${message.slice(0, 1500)}`);
    } else {
      console.error("LOG_CHANNEL_ID is not a text channel");
    }
  } catch (loggingError) {
    console.error("Could not write to LOG_CHANNEL_ID:", safeErrorMessage(loggingError, config));
  }
}
