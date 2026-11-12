import { requestRobloxJson } from "./api.js";

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function resolveUsername(username: string): Promise<RobloxUser | null> {
  const payload = await requestRobloxJson(new URL("https://users.roblox.com/v1/usernames/users"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("Roblox username lookup returned invalid data");
  }
  if (payload.data.length === 0) return null;
  const user = payload.data[0];
  if (!isRecord(user)) throw new Error("Roblox username lookup returned an invalid user");
  if (
    typeof user.id !== "number" ||
    typeof user.name !== "string" ||
    typeof user.displayName !== "string"
  ) {
    throw new Error("Roblox username lookup returned an invalid user");
  }

  return { id: user.id, name: user.name, displayName: user.displayName };
}

export async function resolveUsernames(userIds: number[]): Promise<Map<number, string>> {
  if (userIds.length === 0) return new Map();

  const payload = await requestRobloxJson(new URL("https://users.roblox.com/v1/users"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ userIds, excludeBannedUsers: false }),
  });
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("Roblox user lookup returned invalid data");
  }

  const usernames = new Map<number, string>();
  for (const user of payload.data) {
    if (
      !isRecord(user) ||
      typeof user.id !== "number" ||
      !Number.isSafeInteger(user.id) ||
      typeof user.name !== "string" ||
      user.name.trim().length === 0
    ) {
      throw new Error("Roblox user lookup returned an invalid user");
    }
    usernames.set(user.id, user.name.trim());
  }
  return usernames;
}

export async function getAvatarHeadshot(userId: number): Promise<string | null> {
  const url = new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot");
  url.searchParams.set("userIds", String(userId));
  url.searchParams.set("size", "150x150");
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");

  const payload = await requestRobloxJson(url, {
    headers: { Accept: "application/json" },
  });
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;
  const avatar = payload.data[0];
  if (!isRecord(avatar)) return null;
  const imageUrl = avatar.imageUrl;
  return typeof imageUrl === "string" ? imageUrl : null;
}
