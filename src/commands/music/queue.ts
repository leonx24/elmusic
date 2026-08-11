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
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    const queue = client.queues.get(interaction.guildId!);
    if (!queue || !queue.current) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("There is no music playing right now."),
        ephemeral: true,
      });
    }

    const currentTrack = queue.current;
    const tracksList = queue.tracks;

    const currentDuration = MusicEmbedBuilder.formatDuration(currentTrack.info.length);
    const nowPlayingText = `**Now Playing:**\n[${currentTrack.info.title}](${currentTrack.info.uri || "#"}) | \`${currentDuration}\` (Requested by: ${currentTrack.requester})`;

    let queueListText = "";
    if (tracksList.length === 0) {
      queueListText = "No other songs in the queue.";
    } else {
      queueListText = tracksList
        .slice(0, 10)
        .map((track, i) => {
          const duration = MusicEmbedBuilder.formatDuration(track.info.length);
          return `**${i + 1}.** [${track.info.title}](${track.info.uri || "#"}) | \`${duration}\` (Requested by: ${track.requester})`;
        })
        .join("\n");

      if (tracksList.length > 10) {
        queueListText += `\n*...and ${tracksList.length - 10} more tracks*`;
      }
    }

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
            content: `• **Total Songs:** ${tracksList.length + 1}\n• **Loop Mode:** ${queue.loop.toUpperCase()}\n• **24/7 Standby:** ${queue.twentyFourSeven ? "ENABLED" : "DISABLED"}`,
          },
        ],
        footer: "elmusic | leon x music system",
      })
    );
  }
}
