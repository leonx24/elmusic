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

    const guildId = interaction.guildId!;
    const isCurrently247 = client.twentyFourSevenGuilds.has(guildId);

    if (isCurrently247) {
      client.twentyFourSevenGuilds.delete(guildId);
    } else {
      client.twentyFourSevenGuilds.add(guildId);
    }

    const isNow247 = !isCurrently247;
    const statusText = isNow247 ? "ENABLED" : "DISABLED";
    const descriptionText = isNow247
      ? "The bot will now stay in the voice channel even after the queue finishes."
      : "The bot will now automatically leave the voice channel when the queue is empty.";

    return interaction.reply(
      MusicEmbedBuilder.success(`24/7 Mode: ${statusText}`, descriptionText)
    );
  }
}
