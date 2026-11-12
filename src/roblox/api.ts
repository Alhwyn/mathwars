interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const responseCache = new Map<string, CacheEntry>();
const cacheDurationMs = 3 * 60 * 1000;
const maximumCacheEntries = 500;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return 1000 * 2 ** attempt;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cacheKey(url: URL, init: RequestInit): string {
  return `${init.method ?? "GET"}:${url.toString()}:${typeof init.body === "string" ? init.body : ""}`;
}

export async function requestRobloxJson(url: URL, init: RequestInit): Promise<unknown> {
  const key = cacheKey(url, init);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value);
  if (cached) responseCache.delete(key);

  let response: Response | undefined;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    if (response.status !== 429 || attempt === 3) break;
    const wait = retryDelay(response, attempt);
    await response.body?.cancel();
    await delay(wait);
  }

  if (!response?.ok) {
    throw new Error(`Roblox API request failed (${response?.status ?? "no response"})`);
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
