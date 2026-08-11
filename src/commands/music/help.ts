import { ChatInputCommandInteraction } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { config } from "../../config.js";

export default class HelpCommand extends Command {
  constructor() {
    super({
      name: "help",
      description: "Display all available slash and prefix commands",
      aliases: ["h", "commands"],
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    const p = config.prefix;

    const commandsList = [
      `\`${p}play\` | \`/play <query|url>\` - Play music from YouTube, Spotify, or SoundCloud (Alias: \`${p}p\`)`,
      `\`${p}queue\` | \`/queue\` - Display the current music queue and playing track (Alias: \`${p}q\`)`,
      `\`${p}skip\` | \`/skip\` - Skip the currently playing track (Alias: \`${p}s\`)`,
      `\`${p}leave\` | \`/leave\` - Disconnect the bot from the voice channel (Alias: \`${p}dc\`, \`${p}stop\`)`,
      `\`${p}volume\` | \`/volume <1-100>\` - Set the playback volume (Alias: \`${p}vol\`, \`${p}v\`)`,
      `\`${p}lyrics\` | \`/lyrics [query]\` - Fetch synchronized lyrics for the current or requested song (Alias: \`${p}l\`)`,
      `\`${p}247\` | \`/247\` - Toggle 24/7 mode to keep bot in voice channel when idle`,
      `\`${p}autoplay\` | \`/autoplay\` - Toggle smart autoplay to continuously play similar recommended songs (Alias: \`${p}ap\`)`,
      `\`${p}help\` | \`/help\` - View this help menu and command list (Alias: \`${p}h\`)`,
    ].join("\n\n");

    return interaction.reply(
      MusicEmbedBuilder.success(
        "El Music System - Help & Commands",
        `**Default Prefix:** \`${p}\` (You can type commands using \`/\` or prefix \`${p}\`)\n\n${commandsList}`
      )
    );
  }
}
