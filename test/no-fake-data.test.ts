import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseOrderedEntries } from "../src/data/robloxProvider.js";

const FAKE_NAMES = ["Builderman", "AlexBuilder", "JohnDoe", "JaneDoe"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|js)$/.test(name) ? [path] : [];
  });
}

const baseEnv = {
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "1",
  LEADERBOARD_CHANNEL_ID: "2",
};

async function loadConfigWith(env: Record<string, string>) {
  const saved = { ...process.env };
  for (const key of ["DATA_PROVIDER", "ROBLOX_API_KEY", "ROBLOX_UNIVERSE_ID", "ROBLOX_KILLS_DATASTORE", "ROBLOX_WINS_DATASTORE"]) delete process.env[key];
  Object.assign(process.env, env);
  try {
    const { loadConfig } = await import("../src/config.js");
    return loadConfig();
  } finally {
    process.env = saved;
  }
}

test("no source file contains fake sample players or a stub provider", () => {
  for (const file of [...sourceFiles("src"), ...sourceFiles("api")]) {
    const text = readFileSync(file, "utf8");
    for (const name of FAKE_NAMES) assert.ok(!text.includes(name), `${file} contains fake player ${name}`);
    assert.ok(!/StubProvider/.test(text), `${file} references StubProvider`);
  }
});

test("config refuses to start without real Roblox credentials", async () => {
  await assert.rejects(() => loadConfigWith(baseEnv), /ROBLOX_API_KEY/);
});

test("DATA_PROVIDER=stub cannot switch back to fake data", async () => {
  await assert.rejects(() => loadConfigWith({ ...baseEnv, DATA_PROVIDER: "stub" }), /ROBLOX_/);
});

test("config always uses the Roblox provider when credentials exist", async () => {
  const config = await loadConfigWith({
    ...baseEnv,
    DATA_PROVIDER: "stub",
    ROBLOX_API_KEY: "k",
    ROBLOX_UNIVERSE_ID: "10769958564",
    ROBLOX_KILLS_DATASTORE: "MathWarsOlympiadsKills_v1",
    ROBLOX_WINS_DATASTORE: "MathWarsOlympiadsWins_v1",
  });
  assert.equal(config.dataProvider, "roblox");
  assert.equal(config.robloxUniverseId, "10769958564");
});

test("ordered DataStore entries become real userId/score pairs", () => {
  const rows = parseOrderedEntries({
    orderedDataStoreEntries: [
      { id: "1428030347", value: 882 },
      { id: "bad", value: 5 },
    ],
  });
  assert.deepEqual(rows, [{ userId: 1428030347, score: 882 }]);
  assert.deepEqual(parseOrderedEntries({}), []);
});
