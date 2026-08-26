import { ChatInputCommandInteraction, ApplicationCommandOptionType, GuildMember, GuildTextBasedChannel, AutocompleteInteraction } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { Queue } from "../../structures/Queue.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { logger } from "../../utils/logger.js";
import { SpotifyResolver } from "../../utils/spotify.js";

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

    await interaction.deferReply();

    const node = client.shoukaku.getIdealNode();

    if (!node) {
      return interaction.editReply(
        MusicEmbedBuilder.error("Lavalink node is not available. Please try again later.")
      );
    }

    // === Spotify handling ===
    if (SpotifyResolver.isSpotifyUrl(query)) {
      const spotifyData = await SpotifyResolver.resolve(query);
      if (!spotifyData || spotifyData.tracks.length === 0) {
        return interaction.editReply(
          MusicEmbedBuilder.error("Could not resolve Spotify link. Make sure the link is public.")
        );
      }

      let queue = client.queues.get(interaction.guildId!);
      if (!queue) {
        const player = await client.shoukaku.joinVoiceChannel({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          shardId: interaction.guild?.shardId ?? 0,
        });
        queue = new Queue(client, player, interaction.guildId!, interaction.channel as GuildTextBasedChannel);
        client.queues.set(interaction.guildId!, queue);
      }

      let addedCount = 0;
      for (const sTrack of spotifyData.tracks) {
        try {
          let res = await node.rest.resolve(`ytmsearch:${sTrack.query}`);
          if (!res || !res.data || (Array.isArray(res.data) && res.data.length === 0) || res.loadType === "error" || res.loadType === "empty") {
            res = await node.rest.resolve(`ytsearch:${sTrack.query}`);
          }
          if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
            queue.addTrack(res.data[0], interaction.user.tag);
            addedCount++;
          }
        } catch (err) {
          logger.error(`Error resolving Spotify track "${sTrack.query}":`, err);
        }
      }

      if (addedCount === 0) {
        return interaction.editReply(
          MusicEmbedBuilder.error("Failed to match any tracks from Spotify.")
        );
      }

      if (spotifyData.type === "playlist" || spotifyData.type === "album") {
        return interaction.editReply(
          MusicEmbedBuilder.success(
            "Spotify Playlist Added",
            `Added **${addedCount}** tracks from Spotify ${spotifyData.type} **${spotifyData.name}**.`
          )
        );
      } else {
        return interaction.editReply(
          MusicEmbedBuilder.success(
            "Spotify Track Added",
            `Enqueued Spotify track: **${spotifyData.name}**.`
          )
        );
      }
    }

    // Determine initial search query
    let searchQuery = /^(https?:\/\/|ytsearch:|ytmsearch:)/.test(query)
      ? query
      : `ytmsearch:${query}`;

    // If query contains a YouTube playlist parameter list=, prioritize resolving as playlist
    const listMatch = query.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch && listMatch[1] && !query.includes("playlist?list=")) {
      const directPlaylistUrl = `https://www.youtube.com/playlist?list=${listMatch[1]}`;
      try {
        const plRes = await node.rest.resolve(directPlaylistUrl);
        if (plRes && plRes.loadType === "playlist") {
          searchQuery = directPlaylistUrl;
        }
      } catch (e) {
        // Fallback to original search query if direct playlist resolve fails
      }
    }

    try {
      let result = await node.rest.resolve(searchQuery);

      // Fallback search logic if primary search encounters an error or returns empty
      if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
        let fallbackText = query;

        if (/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(query)) {
          try {
            const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`);
            if (oembedRes.ok) {
              const oembedData = (await oembedRes.json()) as any;
              if (oembedData.title) {
                fallbackText = `${oembedData.author_name || ""} ${oembedData.title}`.trim();
              }
            }
          } catch (err) {
            logger.error(`Error resolving YouTube oEmbed for ${query}:`, err);
          }
        }

        const cleanSearch = fallbackText.replace(/https?:\/\/\S+/g, "").trim() || query;

        result = await node.rest.resolve(`ytsearch:${cleanSearch}`);
        if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
          result = await node.rest.resolve(`ytmsearch:${cleanSearch}`);
        }
      }

      if (result?.loadType === "error") {
        const errData = result.data as any;
        const errMsg = errData?.message || errData?.exception?.message || "Unknown Lavalink error";
        logger.error("Lavalink resolve error:", errMsg);
        return interaction.editReply(
          MusicEmbedBuilder.error(
            `Failed to load track from Lavalink.\n\n**Error:** ${errMsg}\n\nThis usually means the YouTube plugin cannot stream this video. Try a different track, or check the bot logs for client-level errors.`
          )
        );
      }

      if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "empty") {
        return interaction.editReply(
          MusicEmbedBuilder.error("Could not resolve or play this track from YouTube. The source video or playlist may require login or age verification.")
        );
      }

      const { loadType, data } = result;

      // Get or create queue
      let queue = client.queues.get(interaction.guildId!);
      if (!queue) {
        const player = await client.shoukaku.joinVoiceChannel({
          guildId: interaction.guildId!,
          channelId: voiceChannel.id,
          shardId: interaction.guild?.shardId ?? 0,
        });

        queue = new Queue(client, player, interaction.guildId!, interaction.channel as GuildTextBasedChannel);
        client.queues.set(interaction.guildId!, queue);
      }

      if (loadType === "playlist") {
        const playlist = data as any;
        const tracks = Array.isArray(playlist.tracks)
          ? playlist.tracks
          : (Array.isArray(playlist.data) ? playlist.data : (Array.isArray(playlist) ? playlist : []));
        const playlistName = playlist.info?.name || playlist.name || "YouTube Playlist";

        if (tracks.length === 0) {
          return interaction.editReply(MusicEmbedBuilder.error("The playlist is empty or could not be loaded."));
        }

        for (const track of tracks) {
          queue.addTrack(track, interaction.user.tag);
        }

        return interaction.editReply(
          MusicEmbedBuilder.success(
            "Playlist Added",
            `Added **${tracks.length}** tracks from playlist **${playlistName}** to the queue.`
          )
        );
      } else if (loadType === "search" || loadType === "track") {
        const tracks = Array.isArray(data) ? data : [data];
        const track = tracks[0];

        const fallbackCandidates = tracks.slice(1, 4);
        try {
          if (typeof queue.setFallbackTracks === "function") {
            queue.setFallbackTracks(track, fallbackCandidates, interaction.user.tag);
          }
        } catch (err) {
          logger.warn("Could not set fallback tracks:", err);
        }

        queue.addTrack(track, interaction.user.tag);

        if (queue.current && queue.tracks.length > 0) {
          return interaction.editReply(
            MusicEmbedBuilder.success(
              "Track Added",
              `Added **[${track.info.title}](${track.info.uri || "#"})** to the queue.`
            )
          );
        }

        return interaction.editReply(
          MusicEmbedBuilder.success(
            "Playing Track",
            `Starting to play **[${track.info.title}](${track.info.uri || "#"})**.`
          )
        );
      } else if (loadType === "empty") {
        return interaction.editReply(MusicEmbedBuilder.error("No results found for your query."));
      } else {
        return interaction.editReply(MusicEmbedBuilder.error(`Could not load the track. Unknown load type: "${loadType}"`));
      }
    } catch (error) {
      logger.error("Error in play command:", error);
      return interaction.editReply(MusicEmbedBuilder.error("An error occurred while resolving the track."));
    }
  }

  async autocomplete(client: BotClient, interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused()?.trim();
    if (!focusedValue || focusedValue.length < 2) {
      return interaction.respond([]).catch(() => {});
    }

    const node = client.shoukaku.getIdealNode();
    if (!node) return interaction.respond([]).catch(() => {});

    try {
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2000));

      const searchPromise = (async () => {
        let res = await node.rest.resolve(`ytmsearch:${focusedValue}`);
        if (!res || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
          res = await node.rest.resolve(`ytsearch:${focusedValue}`);
        }
        return res;
      })();

      const result = (await Promise.race([searchPromise, timeoutPromise])) as any;

      if (!result || !result.data || !Array.isArray(result.data)) {
        return interaction.respond([]).catch(() => {});
      }

      let tracks = [...result.data];
      const isUserSearchingCover = /cover|karaoke|tribute|remix|instrumental/i.test(focusedValue);

      if (!isUserSearchingCover) {
        tracks.sort((a: any, b: any) => {
          const aTitle = a.info?.title || "";
          const aAuthor = a.info?.author || "";
          const bTitle = b.info?.title || "";
          const bAuthor = b.info?.author || "";

          const aIsCover = /cover|karaoke|tribute|remix|instrumental/i.test(aTitle) || /cover|karaoke|tribute/i.test(aAuthor);
          const bIsCover = /cover|karaoke|tribute|remix|instrumental/i.test(bTitle) || /cover|karaoke|tribute/i.test(bAuthor);

          if (aIsCover && !bIsCover) return 1;
          if (!aIsCover && bIsCover) return -1;
          return 0;
        });
      }

      const choices = tracks.slice(0, 10).map((track: any) => {
        const title = track.info?.title || "Track";
        const author = track.info?.author || "";
        const label = author && author !== "Unknown Artist" ? `${title} - ${author}` : title;
        return {
          name: label.substring(0, 100),
          value: label.substring(0, 100),
        };
      });

      await interaction.respond(choices).catch(() => {});
    } catch (error) {
      await interaction.respond([]).catch(() => {});
    }
  }
}
