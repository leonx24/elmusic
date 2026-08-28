import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { buildV2Container } from "../../utils/components-v2.js";

export default class QueueCommand extends Command {
  constructor() {
    super({
      name: "queue",
      description: "Show the current playing song and the queue list",
      aliases: ["q"],
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    const queue = client.distube.getQueue(interaction.guildId!);
    if (!queue || !queue.songs || queue.songs.length === 0) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("There is no music playing right now."),
        ephemeral: true,
      });
    }

    const currentSong = queue.songs[0];
    const upcomingSongs = queue.songs.slice(1);

    const nowPlayingText = `**Now Playing:**\n[${currentSong.name}](${currentSong.url || "#"}) | \`${currentSong.formattedDuration}\` (Requested by: ${currentSong.user?.tag || "User"})`;

    let queueListText = "";
    if (upcomingSongs.length === 0) {
      queueListText = "No other songs in the queue.";
    } else {
      queueListText = upcomingSongs
        .slice(0, 10)
        .map((song, i) => {
          return `**${i + 1}.** [${song.name}](${song.url || "#"}) | \`${song.formattedDuration}\` (Requested by: ${song.user?.tag || "User"})`;
        })
        .join("\n");

      if (upcomingSongs.length > 10) {
        queueListText += `\n*...and ${upcomingSongs.length - 10} more tracks*`;
      }
    }

    const repeatModeText = queue.repeatMode === 1 ? "Track" : queue.repeatMode === 2 ? "Queue" : "Off";
    const is247 = client.twentyFourSevenGuilds.has(interaction.guildId!);

    return interaction.reply(
      buildV2Container({
        title: `Music Queue - ${interaction.guild?.name}`,
        description: nowPlayingText,
        sections: [
          {
            title: "Up Next",
            content: queueListText,
          },
          {
            title: "Status & Settings",
            content: `• **Total Songs:** ${queue.songs.length}\n• **Volume:** ${queue.volume}%\n• **Loop Mode:** ${repeatModeText}\n• **Autoplay:** ${queue.autoplay ? "ENABLED" : "DISABLED"}\n• **24/7 Standby:** ${is247 ? "ENABLED" : "DISABLED"}`,
          },
        ],
        footer: "elmusic | leon x music system",
      })
    );
  }
}
