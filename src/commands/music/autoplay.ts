 import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class AutoplayCommand extends Command {
  constructor() {
    super({
      name: "autoplay",
      description: "Toggle autoplay mode to automatically play related songs when queue is empty",
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("You must be in a voice channel to use this command."),
        ephemeral: true,
      });
    }

    const queue = client.queues.get(interaction.guildId!);
    if (!queue) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("There is no active music queue right now. Play some music first!"),
        ephemeral: true,
      });
    }

    const selfMember = interaction.guild?.members.me;
    if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("You must be in the same voice channel as me to toggle autoplay."),
        ephemeral: true,
      });
    }

    // Toggle autoplay
    queue.autoplay = !queue.autoplay;

    const statusText = queue.autoplay ? "ENABLED" : "DISABLED";
    const descriptionText = queue.autoplay
      ? "Autoplay is now ON. When the current queue finishes, similar recommended songs will play automatically."
      : "Autoplay is now OFF. Playback will stop when the queue finishes.";

    return interaction.reply(
      MusicEmbedBuilder.success(`Autoplay: ${statusText}`, descriptionText)
    );
  }
}
