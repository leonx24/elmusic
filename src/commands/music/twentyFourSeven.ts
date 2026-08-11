import { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class TwentyFourSevenCommand extends Command {
  constructor() {
    super({
      name: "247",
      description: "Toggle 24/7 mode to keep the bot in the voice channel indefinitely",
      aliases: ["24-7"],
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
        ...MusicEmbedBuilder.error("There is no music queue active right now. Play some music first!"),
        ephemeral: true,
      });
    }

    const selfMember = interaction.guild?.members.me;
    if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("You must be in the same voice channel as me to toggle 24/7 mode."),
        ephemeral: true,
      });
    }

    // Toggle 24/7 mode
    queue.twentyFourSeven = !queue.twentyFourSeven;

    const statusText = queue.twentyFourSeven ? "ENABLED" : "DISABLED";
    const descriptionText = queue.twentyFourSeven 
      ? "The bot will now stay in the voice channel even after the queue finishes." 
      : "The bot will now automatically leave the voice channel when the queue is empty.";

    return interaction.reply(
      MusicEmbedBuilder.success(`24/7 Mode: ${statusText}`, descriptionText)
    );
  }
}
