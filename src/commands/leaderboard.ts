import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import type { Config } from "../config.js";
import type { DataProvider, LeaderboardEntry, LeaderboardKind } from "../data/provider.js";
import { logError } from "../logging.js";
import { getAvatarHeadshot, resolveUsername, type RobloxUser } from "../roblox/users.js";

export const leaderboardCommand = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show a Roblox player's Kills and Wins")
  .addStringOption((option) =>
    option
      .setName("roblox_username")
      .setDescription("Roblox username")
      .setRequired(true)
      .setMaxLength(20),
  );

function playerSummary(entries: LeaderboardEntry[], userId: number, topSize: number): string {
  const index = entries.findIndex((entry) => entry.userId === userId);
  const entry = entries[index];
  if (index >= 0 && index < topSize && entry) {
    const medal = ["🥇", "🥈", "🥉"][index] ?? "";
    return `${medal ? `${medal} ` : ""}**Rank:** #${index + 1}\n**Score:** ${entry.score.toLocaleString("en-US")}`;
  }

  if (entry) {
    return `**Rank:** #${index + 1} (outside top ${topSize})\n**Score:** ${entry.score.toLocaleString("en-US")}`;
  }
  if (entries.length === 0) return "No leaderboard data yet.";
  return `**Rank:** outside top ${topSize}\n**Score:** no score record found`;
}

function createEmbed(
  user: { id: number; name: string; displayName: string },
  boards: Record<LeaderboardKind, LeaderboardEntry[]>,
  topSize: number,
  avatar: string | null,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${user.displayName} (@${user.name})` })
    .setTitle("Roblox leaderboard")
    .setURL(`https://www.roblox.com/users/${user.id}/profile`)
    .addFields(
      {
        name: "⚔️ Kills",
        value: playerSummary(boards.kills, user.id, topSize),
        inline: false,
      },
      {
        name: "🏆 Wins",
        value: playerSummary(boards.wins, user.id, topSize),
        inline: false,
      },
    )
    .setFooter({ text: "Roblox profile • closes in 2 minutes" });
  if (avatar) embed.setThumbnail(avatar);
  return embed;
}

function closeButton(interactionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`leaderboard:${interactionId}:close`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️"),
  );
}

function discordDisplayName(interaction: {
  member: unknown;
  user: { globalName: string | null; username: string };
}): string {
  const member = interaction.member;
  if (typeof member === "object" && member !== null) {
    if ("displayName" in member && typeof member.displayName === "string") {
      return member.displayName;
    }
    if ("nick" in member && typeof member.nick === "string" && member.nick.length > 0) {
      return member.nick;
    }
  }
  return interaction.user.globalName ?? interaction.user.username;
}

function safeMessageName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/([\\*_~|`>])/g, "\\$1")
    .slice(0, 80);
}

function closedMessage(name: string): string {
  const messages = [
    `📜 **${name} closed the leaderboard. The numbers remain classified.**`,
    `😨 **${name} saw the stats and immediately chose not to know.**`,
    `🏃 **${name} ran from the numbers. Nobody blames them.**`,
    `🫣 **${name} peeked at the leaderboard and lived to regret it.**`,
    `🔒 **${name} sealed the leaderboard. Some scores are too powerful.**`,
    `👻 **${name} vanished after seeing those numbers.**`,
    `🧮 **${name} closed the leaderboard before the math got personal.**`,
    `🚪 **${name} has left the leaderboard room. The numbers were scary.**`,
    `🤯 **${name} saw the stats. Brain loading… please stand by.**`,
    `🕵️ **${name} classified the leaderboard and denied seeing anything.**`,
  ];
  return messages[Math.floor(Math.random() * messages.length)] ?? messages[0]!;
}

export async function executeLeaderboard(
  interaction: ChatInputCommandInteraction,
  provider: DataProvider,
  client: Client,
  config: Config,
): Promise<void> {
  await interaction.deferReply();
  const username = interaction.options.getString("roblox_username", true).trim();

  let user: RobloxUser | null;
  try {
    user = await resolveUsername(username);
  } catch (error) {
    await logError(client, config, "Roblox username lookup", error);
    await interaction.editReply("Roblox is temporarily unavailable. Please try again later.");
    return;
  }
  if (!user) {
    await interaction.editReply(`Roblox user "${username}" was not found.`);
    return;
  }

  let boards: Record<LeaderboardKind, LeaderboardEntry[]>;
  try {
    const [kills, wins] = await Promise.all([
      provider.getLeaderboard("kills"),
      provider.getLeaderboard("wins"),
    ]);
    boards = { kills, wins };
  } catch (error) {
    await logError(client, config, "Leaderboard data lookup", error);
    await interaction.editReply("Leaderboard data is temporarily unavailable. Please try again later.");
    return;
  }
  if (boards.kills.length === 0 && boards.wins.length === 0) {
    await interaction.editReply("No leaderboard data yet. Please try again later.");
    return;
  }

  let avatar: string | null = null;
  try {
    avatar = await getAvatarHeadshot(user.id);
  } catch (error) {
    await logError(client, config, "Roblox avatar lookup", error);
  }

  const message = await interaction.editReply({
    embeds: [createEmbed(user, boards, config.topSize, avatar)],
    components: [closeButton(interaction.id)],
  });
  const collector = message.createMessageComponentCollector({
    time: 2 * 60 * 1000,
  });

  collector.on("collect", (buttonInteraction) => {
    void (async () => {
      try {
        if (buttonInteraction.user.id !== interaction.user.id) {
          await buttonInteraction.reply({
            content: "Only the person who ran this command can use these buttons.",
            ephemeral: true,
          });
          return;
        }

        await buttonInteraction.update({
          content: closedMessage(safeMessageName(discordDisplayName(buttonInteraction))),
          embeds: [],
          components: [],
          allowedMentions: { parse: [] },
        });
        collector.stop("closed");
        setTimeout(() => {
          void message.delete().catch((error: unknown) => {
            void logError(client, config, "Closed leaderboard deletion", error);
          });
        }, 5_000).unref();
      } catch (error) {
        await logError(client, config, "Leaderboard button interaction", error);
        if (!buttonInteraction.replied && !buttonInteraction.deferred) {
          await buttonInteraction.reply({
            content: "Could not switch leaderboard view. Please run the command again.",
            ephemeral: true,
          });
        }
      }
    })();
  });

  collector.on("end", (_collected, reason) => {
    if (reason === "closed") return;
    void message.delete().catch((error: unknown) => {
      void logError(client, config, "Leaderboard message expiry", error);
    });
  });
}
