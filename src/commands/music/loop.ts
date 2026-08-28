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
            { name: "Off (Disable Loop)", value: "0" },
            { name: "Track (Repeat Current Song)", value: "1" },
            { name: "Queue (Repeat Entire Queue)", value: "2" },
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

    const queue = client.distube.getQueue(interaction.guildId!);
    if (!queue || !queue.songs || queue.songs.length === 0) {
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
    let newMode = 0;

    if (modeInput !== null) {
      newMode = parseInt(modeInput, 10);
    } else {
      // Cycle: 0 -> 1 -> 2 -> 0
      newMode = (queue.repeatMode + 1) % 3;
    }

    client.distube.setRepeatMode(interaction.guildId!, newMode);

    let description = "";
    let modeName = "OFF";
    if (newMode === 1) {
      modeName = "TRACK";
      description = `Now repeating current song: **${queue.songs[0].name}**.`;
    } else if (newMode === 2) {
      modeName = "QUEUE";
      description = "Now repeating the entire queue.";
    } else {
      modeName = "OFF";
      description = "Loop mode is now turned **OFF**.";
    }

    return interaction.reply(
      MusicEmbedBuilder.success(`Loop Mode: ${modeName}`, description)
    );
  }
}
