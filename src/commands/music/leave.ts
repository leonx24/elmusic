import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class LeaveCommand extends Command {
  constructor() {
    super({
      name: "leave",
      description: "Disconnect the bot from the voice channel and clear the queue",
      aliases: ["dc", "stop"],
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

    const selfMember = interaction.guild?.members.me;
    if (!selfMember?.voice.channel) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("I am not connected to any voice channel."),
        ephemeral: true,
      });
    }

    if (selfMember.voice.channel.id !== voiceChannel.id) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("You must be in the same voice channel as me to make me leave."),
        ephemeral: true,
      });
    }

    const queue = client.queues.get(interaction.guildId!);
    if (queue) {
      queue.destroy();
    } else {
      // Fallback if queue object doesn't exist but bot is in channel
      await client.shoukaku.leaveVoiceChannel(interaction.guildId!);
    }

    return interaction.reply(
      MusicEmbedBuilder.success("Disconnected", "Successfully disconnected from the voice channel and cleared the queue.")
    );
  }
}
