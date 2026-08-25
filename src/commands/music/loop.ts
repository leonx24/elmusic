import { ChatInputCommandInteraction, ApplicationCommandOptionType, GuildMember } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class LoopCommand extends Command {
  constructor() {
    super({
      name: "loop",
      description: "Set or cycle the music loop mode (off, track, queue)",
      aliases: ["repeat", "lp"],
      options: [
        {
          name: "mode",
          description: "Loop mode to set",
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            { name: "Off (Disable Loop)", value: "none" },
            { name: "Track (Repeat Current Song)", value: "track" },
            { name: "Queue (Repeat Entire Queue)", value: "queue" },
          ],
        },
      ],
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

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
        ...MusicEmbedBuilder.error("You must be in the same voice channel as me to change loop mode."),
        ephemeral: true,
      });
    }

    const modeInput = interaction.options.getString("mode");

    if (modeInput && (modeInput === "none" || modeInput === "track" || modeInput === "queue")) {
      queue.loop = modeInput;
    } else {
      // Cycle: none -> track -> queue -> none
      if (queue.loop === "none") {
        queue.loop = "track";
      } else if (queue.loop === "track") {
        queue.loop = "queue";
      } else {
        queue.loop = "none";
      }
    }

    let description = "";
    if (queue.loop === "track") {
      description = `Now repeating current song: **${queue.current.info.title}**.`;
    } else if (queue.loop === "queue") {
      description = "Now repeating the entire queue.";
    } else {
      description = "Loop mode is now turned **OFF**.";
    }

    return interaction.reply(
      MusicEmbedBuilder.success(`Loop Mode: ${queue.loop.toUpperCase()}`, description)
    );
  }
}
