import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const configKeys = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "LEADERBOARD_CHANNEL_ID",
  "LOG_CHANNEL_ID",
  "DATA_PROVIDER",
  "ROBLOX_DATASTORE_MODE",
  "ROBLOX_API_KEY",
  "ROBLOX_UNIVERSE_ID",
  "ROBLOX_DATASTORE_NAME",
  "ROBLOX_KILLS_DATASTORE_NAME",
  "ROBLOX_WINS_DATASTORE_NAME",
  "ROBLOX_KILLS_ENTRY_KEY",
  "ROBLOX_WINS_ENTRY_KEY",
  "ROBLOX_ENTRY_KEY",
  "UPDATE_HOUR_UTC",
  "LEADERBOARD_TOP_SIZE",
  "SNAPSHOT_PATH",
];

function setEnv(values) {
  for (const key of configKeys) delete process.env[key];
  Object.assign(process.env, values);
}

test("roblox requests stay on the official https hosts", async () => {
  const { isAllowedRobloxRequest, isAllowedRobloxUrl, requestRobloxJson, RobloxHttpError } = await import(
    "../dist/roblox/api.js"
  );

  assert.equal(isAllowedRobloxUrl(new URL("https://apis.roblox.com/datastores/v1/universes/1")), true);
  assert.equal(isAllowedRobloxUrl(new URL("https://users.roblox.com/v1/users")), true);
  assert.equal(isAllowedRobloxUrl(new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot")), true);
  assert.equal(isAllowedRobloxUrl(new URL("http://apis.roblox.com/")), false);
  assert.equal(isAllowedRobloxUrl(new URL("https://apis.roblox.com.evil.example/")), false);
  assert.equal(isAllowedRobloxUrl(new URL("https://evil.example/collect")), false);
  assert.equal(isAllowedRobloxUrl(new URL("https://user:secret@apis.roblox.com/")), false);
  assert.equal(isAllowedRobloxUrl(new URL("https://apis.roblox.com:444/path")), false);

  assert.equal(isAllowedRobloxRequest(new URL("https://apis.roblox.com/datastores/v1/universes/1"), undefined), true);
  assert.equal(isAllowedRobloxRequest(new URL("https://users.roblox.com/v1/users"), "POST"), true);
  assert.equal(isAllowedRobloxRequest(new URL("https://users.roblox.com/v1/usernames/users"), "post"), true);
  assert.equal(
    isAllowedRobloxRequest(
      new URL("https://apis.roblox.com/datastores/v1/universes/1/standard-datastores/datastore/entries/entry"),
      "POST",
    ),
    false,
  );
  assert.equal(
    isAllowedRobloxRequest(
      new URL("https://apis.roblox.com/cloud/v2/universes/1/ordered-data-stores/scores/scopes/global/entries/1:increment"),
      "POST",
    ),
    false,
  );

  await assert.rejects(
    () => requestRobloxJson(new URL("https://evil.example/collect"), { headers: { "x-api-key": "secret" } }),
    /non-Roblox/,
  );
  await assert.rejects(
    () =>
      requestRobloxJson(
        new URL("https://apis.roblox.com/datastores/v1/universes/1/standard-datastores/datastore/entries/entry"),
        { method: "DELETE", headers: { "x-api-key": "secret" } },
      ),
    /modify Roblox data/,
  );

  const empty = new RobloxHttpError(204);
  assert.equal(empty.status, 204);
  assert.match(empty.message, /204/);
});

test("avatar urls have to be https rbxcdn links", async () => {
  const { isRobloxThumbnailUrl, isInvalidRobloxUsernameError } = await import("../dist/roblox/users.js");
  const { RobloxHttpError } = await import("../dist/roblox/api.js");

  assert.equal(isRobloxThumbnailUrl("https://tr.rbxcdn.com/abc/150/150/AvatarHeadshot/Png"), true);
  assert.equal(isRobloxThumbnailUrl("https://rbxcdn.com/abc"), true);
  assert.equal(isRobloxThumbnailUrl("http://tr.rbxcdn.com/abc"), false);
  assert.equal(isRobloxThumbnailUrl("https://evil.example/abc"), false);
  assert.equal(isRobloxThumbnailUrl("https://user:pass@tr.rbxcdn.com/abc"), false);
  assert.equal(isRobloxThumbnailUrl("not a url"), false);
  assert.equal(isInvalidRobloxUsernameError(new RobloxHttpError(400)), true);
  assert.equal(isInvalidRobloxUsernameError(new RobloxHttpError(503)), false);
  assert.equal(isInvalidRobloxUsernameError(new Error("400")), false);
});

test("rendered names cannot break the code fence or mention the server", async () => {
  const { renderDailyLeaderboard, renderDailyChanges } = await import("../dist/format/render.js");
  const updated = new Date("2026-11-12T08:00:00.000Z");
  const hostile = renderDailyLeaderboard(
    [{ userId: 1, username: "```@everyone <@123456789012345678>", score: 10 }],
    [],
    10,
    updated,
  );
  assert.equal(hostile.match(/```/g)?.length, 2);
  assert.equal(hostile.includes("@everyone"), false);
  assert.equal(hostile.includes("<@"), false);

  const unnamed = renderDailyLeaderboard([{ userId: 1, username: "\u0000\u0001", score: 4 }], [], 10, updated);
  assert.match(unnamed, /Player/);

  const normal = renderDailyLeaderboard(
    [{ userId: 156, username: "Builderman", score: 12450 }],
    [{ userId: 1, username: "Roblox", score: 1e15 }],
    10,
    updated,
  );
  assert.match(normal, /12,450/);
  assert.match(normal, /1000T/);

  const name = "A".repeat(24);
  const huge = Array.from({ length: 10 }, (_, index) => ({
    userId: index + 1,
    username: name,
    score: index % 2 === 0 ? Number.MAX_VALUE : -Number.MAX_VALUE,
  }));
  const board = `||leaderbot:daily-leaderboard||\n${renderDailyLeaderboard(huge, huge, 10, updated, {
    kills: updated,
    wins: updated,
  })}`;
  const changes = renderDailyChanges(
    { kills: huge, wins: huge },
    { kills: huge.map((entry) => ({ ...entry, score: entry.score / 2 })), wins: huge },
    10,
    updated,
    updated,
    new Set(),
  );
  assert.ok(board.length <= 2000, `leaderboard message is ${board.length} characters`);
  assert.ok(changes.length <= 2000, `changes message is ${changes.length} characters`);
  assert.doesNotMatch(board, /179,769/);
});

test("snapshots round-trip and reject corrupt files", async () => {
  const { readSnapshot, writeSnapshot } = await import("../dist/storage/snapshot.js");
  const directory = await mkdtemp(join(tmpdir(), "leaderbot-"));
  try {
    const path = join(directory, "nested", "snapshot.json");
    await writeSnapshot(path, {
      leaderboards: {
        kills: {
          updatedAt: "2026-11-12T00:00:00.000Z",
          entries: [{ userId: 1, username: "A", score: 2 }],
        },
      },
      messageId: "123",
      lastPostedAt: "2026-11-12T00:00:01.000Z",
    });
    const saved = await readSnapshot(path);
    assert.equal(saved?.messageId, "123");
    assert.equal(saved?.lastPostedAt, "2026-11-12T00:00:01.000Z");
    assert.equal(saved?.leaderboards.kills?.entries[0]?.username, "A");
    assert.equal(await readSnapshot(join(directory, "missing.json")), null);

    await writeFile(
      path,
      JSON.stringify({
        updatedAt: "2026-01-01T00:00:00.000Z",
        entries: [{ userId: 2, username: "B", score: 3 }],
      }),
    );
    const legacy = await readSnapshot(path);
    assert.equal(legacy?.leaderboards.kills?.entries[0]?.userId, 2);
    assert.equal(legacy?.leaderboards.wins, undefined);

    await writeFile(path, "{");
    await assert.rejects(() => readSnapshot(path), /invalid JSON/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("config requires discord and roblox settings before startup", async () => {
  setEnv({});
  const { loadConfig } = await import("../dist/config.js");
  assert.throws(() => loadConfig(), /DISCORD_TOKEN/);

  setEnv({ DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "123" });
  const stub = loadConfig();
  assert.equal(stub.dataProvider, "stub");
  assert.equal(stub.robloxKillsEntryKey, "kills");
  assert.equal(stub.robloxWinsEntryKey, "wins");
  assert.equal(stub.updateHourUtc, 8);
  assert.equal(stub.topSize, 10);

  setEnv({ DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "123", DATA_PROVIDER: "roblox" });
  assert.throws(() => loadConfig(), /ROBLOX_API_KEY/);

  setEnv({
    DISCORD_TOKEN: "token",
    DISCORD_CLIENT_ID: "123",
    DATA_PROVIDER: "roblox",
    ROBLOX_API_KEY: "key",
    ROBLOX_UNIVERSE_ID: "10769958564",
    ROBLOX_DATASTORE_MODE: "ordered",
  });
  assert.throws(() => loadConfig(), /ROBLOX_KILLS_DATASTORE_NAME/);

  setEnv({
    DISCORD_TOKEN: "token",
    DISCORD_CLIENT_ID: "123",
    DATA_PROVIDER: "roblox",
    ROBLOX_API_KEY: "key",
    ROBLOX_UNIVERSE_ID: "10769958564",
    ROBLOX_DATASTORE_NAME: "MathRoyale_Profile_v1",
  });
  const roblox = loadConfig();
  assert.equal(roblox.robloxUniverseId, "10769958564");
  assert.equal(roblox.robloxDataStoreName, "MathRoyale_Profile_v1");
  assert.equal(roblox.robloxDataStoreMode, "standard");

  setEnv({ DISCORD_TOKEN: "token", DISCORD_CLIENT_ID: "123", DATA_PROVIDER: "memory" });
  assert.throws(() => loadConfig(), /DATA_PROVIDER/);
  setEnv({});
});
