import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class SkipCommand extends Command {
  constructor() {
    super({
      name: "skip",
      description: "Skip the current playing song",
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        embeds: [MusicEmbedBuilder.error("You must be in a voice channel to use this command.")],
        ephemeral: true,
      });
    }

    const queue = client.queues.get(interaction.guildId!);
    if (!queue || !queue.current) {
      return interaction.reply({
        embeds: [MusicEmbedBuilder.error("There is no music playing right now.")],
        ephemeral: true,
      });
    }

    const selfMember = interaction.guild?.members.me;
    if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
      return interaction.reply({
        embeds: [MusicEmbedBuilder.error("You must be in the same voice channel as me to skip.")],
        ephemeral: true,
      });
    }

    const currentTitle = queue.current.info.title;
    await queue.skip();

    return interaction.reply({
      embeds: [MusicEmbedBuilder.success("Skipped", `Skipped the current track: **${currentTitle}**`)],
    });
  }
}
