export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeDiscordName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/([\\*_~|`>])/g, "\\$1")
    .slice(0, 80);
}
