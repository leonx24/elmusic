import { ChatInputCommandInteraction, ApplicationCommandOptionType, GuildMember } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class VolumeCommand extends Command {
  constructor() {
    super({
      name: "volume",
      description: "Check or change the music playback volume",
      options: [
        {
          name: "level",
          description: "Volume level from 0 to 150",
          type: ApplicationCommandOptionType.Integer,
          required: false,
          minValue: 0,
          maxValue: 150,
        },
      ],
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
    if (!queue || !queue.current) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("There is no music playing right now."),
        ephemeral: true,
      });
    }

    const selfMember = interaction.guild?.members.me;
    if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("You must be in the same voice channel as me to change volume."),
        ephemeral: true,
      });
    }

    const level = interaction.options.getInteger("level");

    if (level === null) {
      // If no level specified, show the current volume
      return interaction.reply(
        MusicEmbedBuilder.success("Current Volume", `The current volume level is **${queue.player.volume}%**`)
      );
    }

    // Change volume
    await queue.setVolume(level);

    return interaction.reply(
      MusicEmbedBuilder.success("Volume Updated", `Volume has been set to **${level}%**`)
    );
  }
}
