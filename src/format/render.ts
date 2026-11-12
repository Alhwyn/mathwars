import type { LeaderboardEntry } from "../data/provider.js";

const RESET = "\u001b[0m";
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const BOLD_CYAN = "\u001b[1;36m";
const BOLD_YELLOW = "\u001b[1;33m";
const BLUE = "\u001b[0;34m";
const GREEN_BOLD = "\u001b[0;32m";
const GOLD = "\u001b[1;33m";
const SILVER = "\u001b[1;37m";
const BRONZE = "\u001b[1;31m";
const RED_BOLD = "\u001b[1;31m";

function ansiBlock(lines: string[]): string {
  return `\`\`\`ansi\n${lines.join("\n")}\n\`\`\``;
}

function formatScore(score: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: Math.abs(score) >= 1e15 ? "compact" : "standard",
  }).format(score);
  if (formatted.length <= 24) return formatted;
  return new Intl.NumberFormat("en-US", {
    notation: "scientific",
    maximumSignificantDigits: 6,
  }).format(score);
}

export function sanitizePlayerText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, "")
    .replace(/<@/g, "<\u200b@")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .replace(/`/g, "'");
}

function displayName(username: string): string {
  const sanitized = sanitizePlayerText(username).slice(0, 24);
  return sanitized.length > 0 ? sanitized : "Player";
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date).replaceAll("/", ".");
}

export function renderDailyLeaderboard(
  kills: LeaderboardEntry[],
  wins: LeaderboardEntry[],
  limit: number,
  updatedAt: Date,
  staleAt: Partial<Record<"kills" | "wins", Date>> = {},
): string {
  const lines = [
    `${BOLD_CYAN}LEADERBOARD${RESET}`,
    "",
    `${BOLD_YELLOW}MOST KILLS:${staleAt.kills ? ` ${RED}· last updated ${dateLabel(staleAt.kills)}${RESET}` : ""}`,
    "",
    ...renderDailyRanking(kills, limit),
    "",
    `${BOLD_YELLOW}MOST WINS:${staleAt.wins ? ` ${RED}· last updated ${dateLabel(staleAt.wins)}${RESET}` : ""}`,
    "",
    ...renderDailyRanking(wins, limit),
    "",
    `${GREEN}Congrats to the champions!${RESET} · Updated: ${dateLabel(updatedAt)}`,
  ];
  return ansiBlock(lines);
}

function renderDailyRanking(entries: LeaderboardEntry[], limit: number): string[] {
  if (entries.length === 0) return [`${YELLOW}No data available.${RESET}`];

  return entries.slice(0, limit).map((entry, index) => {
    const rank = `${BLUE}${index + 1}.${RESET}`;
    const playerColor = [GOLD, SILVER, BRONZE][index] ?? RESET;
    return `${rank} ${playerColor}${displayName(entry.username)}${RESET} - ${GREEN_BOLD}${formatScore(entry.score)}${RESET}`;
  });
}

export function renderDailyChanges(
  previous: Partial<Record<"kills" | "wins", LeaderboardEntry[]>>,
  current: Partial<Record<"kills" | "wins", LeaderboardEntry[]>>,
  topSize: number,
  previousUpdatedAt: Date | null,
  updatedAt: Date,
  failed: ReadonlySet<"kills" | "wins">,
): string {
  const lines = [
    `${BOLD_CYAN}CHANGES ${previousUpdatedAt ? dateLabel(previousUpdatedAt) : "NEW"} -> ${dateLabel(updatedAt)}${RESET}`,
    "",
    ...renderDailyStatChanges("kills", previous.kills, current.kills, topSize, failed.has("kills")),
    "",
    ...renderDailyStatChanges("wins", previous.wins, current.wins, topSize, failed.has("wins")),
  ];

  if (!previousUpdatedAt) {
    lines.push("", `${YELLOW}Changes start with the next update.${RESET}`);
  } else {
    const unchanged = unchangedChampions(previous, current, topSize, failed);
    lines.push(
      "",
      `${YELLOW}No changes:${RESET} ${unchanged.length > 0 ? unchanged.map(displayName).join(", ") : "none"}`,
    );
  }
  lines.push("", `${GREEN}Updated: ${dateLabel(updatedAt)}${RESET}`);
  return ansiBlock(lines);
}

function renderDailyStatChanges(
  kind: "kills" | "wins",
  previous: LeaderboardEntry[] | undefined,
  current: LeaderboardEntry[] | undefined,
  topSize: number,
  unavailable: boolean,
): string[] {
  const title = kind === "kills" ? "Kills:" : "Wins:";
  if (unavailable) return [`${BOLD_YELLOW}${title}${RESET}`, `${RED}Update unavailable; saved data kept.${RESET}`];
  if (!previous || !current) {
    return [`${BOLD_YELLOW}${title}${RESET}`, `${GREEN}Initial snapshot; changes will appear next update.${RESET}`];
  }

  const previousById = new Map(
    previous.map((entry, index) => [entry.userId, { entry, rank: index + 1 }]),
  );
  const currentById = new Map(
    current.map((entry, index) => [entry.userId, { entry, rank: index + 1 }]),
  );
  const changes: string[] = [];
  const exits: string[] = [];

  for (const [userId, currentPlayer] of currentById) {
    if (currentPlayer.rank > topSize) continue;
    const old = previousById.get(userId);
    if (!old) {
      changes.push(
        `${GREEN_BOLD}NEW${RESET} ${displayName(currentPlayer.entry.username)}: ${formatScore(currentPlayer.entry.score)} (#${currentPlayer.rank})`,
      );
      continue;
    }

    const scoreDifference = currentPlayer.entry.score - old.entry.score;
    const rankDifference = currentPlayer.rank - old.rank;
    if (scoreDifference !== 0) {
      const scoreColor = scoreDifference > 0 ? GREEN_BOLD : RED_BOLD;
      const delta = `${scoreDifference > 0 ? "+" : ""}${formatScore(scoreDifference)}`;
      const rankMove = rankDifference === 0 ? "" : ` (#${old.rank} -> #${currentPlayer.rank})`;
      changes.push(
        `${scoreColor}${delta}${RESET} ${displayName(currentPlayer.entry.username)}: ${formatScore(old.entry.score)} -> ${formatScore(currentPlayer.entry.score)}${rankMove}`,
      );
    } else if (rankDifference !== 0) {
      const improving = rankDifference < 0;
      const color = improving ? GREEN_BOLD : RED_BOLD;
      const marker = `${improving ? "^" : "v"}${Math.abs(rankDifference)}`;
      changes.push(
        `${color}${marker}${RESET} ${displayName(currentPlayer.entry.username)}: #${old.rank} -> #${currentPlayer.rank}`,
      );
    }
  }

  for (const [userId, old] of previousById) {
    if (old.rank <= topSize && (currentById.get(userId)?.rank ?? Number.POSITIVE_INFINITY) > topSize) {
      exits.push(
        `${RED_BOLD}OUT${RESET} ${displayName(old.entry.username)} (${formatScore(old.entry.score)})`,
      );
    }
  }

  const exitLimit = Math.min(exits.length, 4);
  const changeLimit = 10 - exitLimit;
  const visibleChanges = [...changes.slice(0, changeLimit), ...exits.slice(0, exitLimit)];
  const remaining = changes.length + exits.length - visibleChanges.length;
  return [
    `${BOLD_YELLOW}${title}${RESET}`,
    ...(visibleChanges.length > 0 ? visibleChanges : [`${GREEN}No ranking or score changes.${RESET}`]),
    ...(remaining > 0 ? [`${YELLOW}…and ${remaining} more${RESET}`] : []),
  ];
}

function unchangedChampions(
  previous: Partial<Record<"kills" | "wins", LeaderboardEntry[]>>,
  current: Partial<Record<"kills" | "wins", LeaderboardEntry[]>>,
  topSize: number,
  failed: ReadonlySet<"kills" | "wins">,
): string[] {
  if (failed.size > 0) return [];
  const unchangedByStat = (kind: "kills" | "wins"): Set<number> => {
    const oldEntries = previous[kind];
    const newEntries = current[kind];
    if (!oldEntries || !newEntries) return new Set();
    const oldRanks = new Map(oldEntries.map((entry, index) => [entry.userId, { entry, rank: index + 1 }]));
    return new Set(
      newEntries.slice(0, topSize)
        .map((entry, index) => {
          const old = oldRanks.get(entry.userId);
          return old && old.rank === index + 1 && old.entry.score === entry.score ? entry.userId : null;
        })
        .filter((userId): userId is number => userId !== null),
    );
  };

  const stable = new Set([...unchangedByStat("kills")].filter((id) => unchangedByStat("wins").has(id)));
  const names = new Map(
    [...(current.kills ?? []), ...(current.wins ?? [])].map((entry) => [entry.userId, entry.username]),
  );
  return [...stable].map((id) => names.get(id)).filter((name): name is string => name !== undefined);
}
