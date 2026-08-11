import { ChatInputCommandInteraction, ApplicationCommandOptionType, GuildMember, GuildTextBasedChannel, AutocompleteInteraction } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { Queue } from "../../structures/Queue.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { logger } from "../../utils/logger.js";

export default class PlayCommand extends Command {
  constructor() {
    super({
      name: "play",
      description: "Play music from YouTube/Spotify/SoundCloud in your voice channel",
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

    const query = interaction.options.getString("query");
    if (!query) {
      return interaction.reply({
        ...MusicEmbedBuilder.error("Please provide a song title or URL to play."),
        ephemeral: true,
      });
    }

    // Defer the reply because resolving search can take some time
    await interaction.deferReply();

    const node = client.shoukaku.getIdealNode();
    
    if (!node) {
      return interaction.editReply(
        MusicEmbedBuilder.error("Lavalink node is not available. Please try again later.")
      );
    }

    const searchQuery = /^(https?:\/\/|ytsearch:|ytmsearch:|scsearch:)/.test(query) ? query : `ytmsearch:${query}`;

    try {
      let result = await node.rest.resolve(searchQuery);

      // Fallback search logic if primary search encounters an error or returns empty
      if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
        let fallbackQuery = query;

        // If query was a YouTube URL, attempt extracting video ID or video search fallback
        const ytIdMatch = query.match(/(?:v=|\/v\/|embed\/|youtu\.be\/|\&v=)([^#\&\?]{11})/);
        if (ytIdMatch && ytIdMatch[1]) {
          fallbackQuery = `ytmsearch:${ytIdMatch[1]}`;
        } else if (!/^(ytsearch:|ytmsearch:|scsearch:)/.test(query)) {
          fallbackQuery = `ytmsearch:${query.replace(/https?:\/\/\S+/g, "").trim() || query}`;
        }

        // Try YouTube Music search fallback
        result = await node.rest.resolve(fallbackQuery);

        // Try YouTube standard search fallback
        if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
          result = await node.rest.resolve(`ytsearch:${query}`);
        }

        // Try SoundCloud search fallback
        if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
          result = await node.rest.resolve(`scsearch:${query}`);
        }
      }

      if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
        return interaction.editReply(
          MusicEmbedBuilder.error("Could not resolve or play this track from YouTube/SoundCloud. The source video may require login or age verification.")
        );
      }

      const { loadType, data } = result;

      // Get or create queue
      let queue = client.queues.get(interaction.guildId!);
      if (!queue) {
        // Join voice channel first
        const player = await client.shoukaku.joinVoiceChannel({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          shardId: interaction.guild?.shardId ?? 0,
        });

        queue = new Queue(client, player, interaction.guildId!, interaction.channel as GuildTextBasedChannel);
        client.queues.set(interaction.guildId!, queue);
      }

      if (loadType === "playlist") {
        const playlist = data as any; // Shoukaku Playlist data
        const tracks = playlist.tracks;
        for (const track of tracks) {
          queue.addTrack(track, interaction.user.tag);
        }

        return interaction.editReply(
          MusicEmbedBuilder.success(
            "Playlist Added",
            `Added **${tracks.length}** tracks from playlist **${playlist.info.name}** to the queue.`
          )
        );
      } else if (loadType === "search" || loadType === "track") {
        const tracks = Array.isArray(data) ? data : [data];
        const track = tracks[0];
        
        queue.addTrack(track, interaction.user.tag);

        // If it's already playing, send a queue added message, otherwise nowPlaying handles it
        if (queue.current && queue.tracks.length > 0) {
          return interaction.editReply(
            MusicEmbedBuilder.success(
              "Track Added",
              `Added **[${track.info.title}](${track.info.uri || "#"})** to the queue.`
            )
          );
        }

        // Edit reply with a loading/playing message (which will soon be updated by now playing event)
        return interaction.editReply(
          MusicEmbedBuilder.success(
            "Playing Track",
            `Starting to play **[${track.info.title}](${track.info.uri || "#"})**.`
          )
        );
      } else if (loadType === "empty") {
        return interaction.editReply(MusicEmbedBuilder.error("No results found for your query."));
      } else if (loadType === "error") {
        return interaction.editReply(MusicEmbedBuilder.error("Lavalink failed to load the track. The source might be blocked or unavailable."));
      } else {
        return interaction.editReply(MusicEmbedBuilder.error(`Could not load the track. Unknown load type: "${loadType}"`));
      }
    } catch (error) {
      logger.error("Error in play command:", error);
      return interaction.editReply(MusicEmbedBuilder.error("An error occurred while resolving the track."));
    }
  }

  async autocomplete(client: BotClient, interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused();
    if (!focusedValue) return interaction.respond([]);

    const node = client.shoukaku.getIdealNode();
    if (!node) return interaction.respond([]);

    try {
      // Use YouTube Music search via public node to get clean, original suggestions
      const result = await node.rest.resolve(`ytmsearch:${focusedValue}`);
      if (!result || !result.data || !Array.isArray(result.data)) {
        return interaction.respond([]);
      }

      // Format suggestions for Discord UI (max 25 choices)
      const choices = result.data.slice(0, 25).map((track: any) => ({
        name: `${track.info.title} - ${track.info.author}`.substring(0, 100),
        value: track.info.uri || `ytmsearch:${track.info.title}`,
      }));

      await interaction.respond(choices);
    } catch (error) {
      await interaction.respond([]).catch(() => {});
    }
  }
}
