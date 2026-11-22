import type { Client } from "discord.js";
import type { Config } from "./types.js";

export function safeErrorMessage(error: unknown, config?: Config): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const secrets = [config?.discordToken, config?.robloxApiKey].filter(
    (secret): secret is string => Boolean(secret),
  );
  return secrets.reduce((safe, secret) => safe.replaceAll(secret, "[REDACTED]"), message);
}

export async function logError(
  _client: Client,
  config: Config,
  context: string,
  error: unknown,
): Promise<void> {
  console.error(`[${context}] ${safeErrorMessage(error, config)}`);
}
