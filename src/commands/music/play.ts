import { ChatInputCommandInteraction, ApplicationCommandOptionType, GuildMember, GuildTextBasedChannel, AutocompleteInteraction } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { logger } from "../../utils/logger.js";
import { resolveQuery } from "../../utils/spotify.js";

export default class PlayCommand extends Command {
  constructor() {
    super({
      name: "play",
      description: "Play music from YouTube or Spotify in your voice channel",
      aliases: ["p"],
      options: [
        {
          name: "query",
          description: "The song title or URL to play",
          type: ApplicationCommandOptionType.String,
          required: true,
          autocomplete: true,
        },
      ],
    });
  }

  async autocomplete(client: BotClient, interaction: AutocompleteInteraction): Promise<unknown> {
    const focusedValue = interaction.options.getFocused().trim();

    // If query is a URL, just show it
    if (/^https?:\/\//i.test(focusedValue)) {
      return interaction.respond([
        { name: `🔗 Link: ${focusedValue.slice(0, 90)}`, value: focusedValue },
      ]);
    }

    if (!focusedValue) {
      return interaction.respond([
        { name: "🎵 Type a song title or paste a YouTube/Spotify link...", value: "https://www.youtube.com" },
      ]);
    }

    try {
      // Query YouTube suggest API for real-time search suggestions
      const response = await fetch(
        `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(focusedValue)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
          },
        }
      );

      if (response.ok) {
        const text = await response.text();
        const jsonMatch = text.match(/\((.*)\)/);
        if (jsonMatch && jsonMatch[1]) {
          const data = JSON.parse(jsonMatch[1]);
          const results: any[] = data[1] || [];
          const choices = results.slice(0, 10).map((item: any) => {
            const suggestion = item[0] as string;
            return {
              name: `🔍 ${suggestion}`.slice(0, 100),
              value: suggestion.slice(0, 100),
            };
          });

          if (choices.length > 0) {
            return interaction.respond(choices);
          }
        }
      }
    } catch (err) {
      logger.warn("Error fetching autocomplete suggestions:", err);
    }

    return interaction.respond([
      { name: `🔍 Search for: "${focusedValue}"`.slice(0, 100), value: focusedValue.slice(0, 100) },
    ]);
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
    if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("I am already playing music in another voice channel."),
        ephemeral: true,
      });
    }

    const rawQuery = interaction.options.getString("query", true);

    await interaction.deferReply();

    try {
      // Resolve query with Spotify-first if it's a search term
      const queryToPlay = await resolveQuery(rawQuery);

      await client.distube.play(voiceChannel, queryToPlay, {
        member,
        textChannel: interaction.channel as GuildTextBasedChannel,
      });

      return interaction.editReply(
        MusicEmbedBuilder.success(
          "Queued Request",
          `🔍 Searching and adding **${rawQuery}** to the queue...`
        )
      );
    } catch (err: any) {
      logger.error(`Error in /play command for "${rawQuery}":`, err);
      return interaction.editReply(
        MusicEmbedBuilder.error(`Failed to play song: ${err.message || err}`)
      );
    }
  }
}
