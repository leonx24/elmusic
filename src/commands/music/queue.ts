import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

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
        embeds: [MusicEmbedBuilder.error("There is no music playing right now.")],
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

    const embed = MusicEmbedBuilder.base()
      .setTitle(`🎶 Music Queue for ${interaction.guild?.name}`)
      .setDescription(`${nowPlayingText}\n\n**Up Next:**\n${queueListText}`)
      .addFields(
        { name: "Total Songs", value: `${tracksList.length + 1}`, inline: true },
        { name: "Loop Mode", value: `${queue.loop.toUpperCase()}`, inline: true },
        { name: "24/7 Mode", value: `${queue.twentyFourSeven ? "ENABLED" : "DISABLED"}`, inline: true }
      );

    return interaction.reply({ embeds: [embed] });
  }
}
