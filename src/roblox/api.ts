interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const responseCache = new Map<string, CacheEntry>();
const cacheDurationMs = 3 * 60 * 1000;
const maximumCacheEntries = 500;
const maximumRetryDelayMs = 30_000;
const allowedHosts = new Set(["apis.roblox.com", "users.roblox.com", "thumbnails.roblox.com"]);

export class RobloxHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      status === 204
        ? "Roblox API entry is empty or deleted (204)"
        : `Roblox API request failed (${status})`,
    );
    this.name = "RobloxHttpError";
    this.status = status;
  }
}

export function isAllowedRobloxUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;
  return allowedHosts.has(url.hostname);
}

const usernameLookupPaths = new Set(["/v1/users", "/v1/usernames/users"]);

export function isAllowedRobloxRequest(url: URL, method: string | undefined): boolean {
  if (!isAllowedRobloxUrl(url)) return false;
  const normalized = (method ?? "GET").trim().toUpperCase();
  if (normalized === "GET" || normalized === "HEAD") return true;
  return normalized === "POST" && url.hostname === "users.roblox.com" && usernameLookupPaths.has(url.pathname);
}

function cappedDelay(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) return maximumRetryDelayMs;
  return Math.min(maximumRetryDelayMs, Math.max(0, milliseconds));
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return cappedDelay(seconds * 1000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return cappedDelay(retryAt - Date.now());
  }
  return cappedDelay(1000 * 2 ** attempt);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cacheKey(url: URL, init: RequestInit): string {
  return `${init.method ?? "GET"}:${url.toString()}:${typeof init.body === "string" ? init.body : ""}`;
}

export async function requestRobloxJson(url: URL, init: RequestInit): Promise<unknown> {
  if (!isAllowedRobloxUrl(url)) {
    throw new Error("Refusing to call a non-Roblox URL");
  }
  if (!isAllowedRobloxRequest(url, typeof init.method === "string" ? init.method : undefined)) {
    throw new Error("Refusing to modify Roblox data");
  }

  const key = cacheKey(url, init);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);
  if (cached) responseCache.delete(key);

  let response: Response | undefined;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 429 || attempt === 3) break;
    const wait = retryDelay(response, attempt);
    await response.body?.cancel();
    await delay(wait);
  }

  if (!response || response.status === 204 || !response.ok) {
    await response?.body?.cancel();
    throw new RobloxHttpError(response?.status ?? 0);
  }

  let value: unknown;
  try {
    value = (await response.json()) as unknown;
  } catch (error) {
    throw new Error("Roblox API returned invalid JSON", { cause: error });
  }

  for (const [entryKey, entry] of responseCache) {
    if (entry.expiresAt <= Date.now()) responseCache.delete(entryKey);
  }
  if (responseCache.size >= maximumCacheEntries) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) responseCache.delete(oldestKey);
  }
  responseCache.set(key, { value, expiresAt: Date.now() + cacheDurationMs });
  return structuredClone(value);
}
