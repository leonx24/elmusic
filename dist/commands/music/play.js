import { ApplicationCommandOptionType } from "discord.js";
import { Command } from "../../structures/Command.js";
import { Queue } from "../../structures/Queue.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { logger } from "../../utils/logger.js";
import { SpotifyResolver } from "../../utils/spotify.js";
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
    async run(client, interaction) {
        const member = interaction.member;
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
            return interaction.editReply(MusicEmbedBuilder.error("Lavalink node is not available. Please try again later."));
        }
        // Check if query is a Spotify link
        if (SpotifyResolver.isSpotifyUrl(query)) {
            const spotifyData = await SpotifyResolver.resolve(query);
            if (!spotifyData || spotifyData.tracks.length === 0) {
                return interaction.editReply(MusicEmbedBuilder.error("Could not resolve Spotify link. Make sure the link is public."));
            }
            // Join voice channel and get or create queue
            let queue = client.queues.get(interaction.guildId);
            if (!queue) {
                const player = await client.shoukaku.joinVoiceChannel({
                    guildId: interaction.guildId,
                    channelId: voiceChannel.id,
                    shardId: interaction.guild?.shardId ?? 0,
                });
                queue = new Queue(client, player, interaction.guildId, interaction.channel);
                client.queues.set(interaction.guildId, queue);
            }
            let addedCount = 0;
            for (const sTrack of spotifyData.tracks) {
                try {
                    // Try SoundCloud search first for 100% reliable streaming
                    let res = await node.rest.resolve(`scsearch:${sTrack.query}`);
                    if (!res || !res.data || (Array.isArray(res.data) && res.data.length === 0) || res.loadType === "error" || res.loadType === "empty") {
                        res = await node.rest.resolve(`ytmsearch:${sTrack.query}`);
                    }
                    if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                        queue.addTrack(res.data[0], interaction.user.tag);
                        addedCount++;
                    }
                }
                catch (err) {
                    logger.error(`Error resolving Spotify track "${sTrack.query}":`, err);
                }
            }
            if (addedCount === 0) {
                return interaction.editReply(MusicEmbedBuilder.error("Failed to match any tracks from Spotify."));
            }
            if (spotifyData.type === "playlist" || spotifyData.type === "album") {
                return interaction.editReply(MusicEmbedBuilder.success("Spotify Playlist Added", `Added **${addedCount}** tracks from Spotify ${spotifyData.type} **${spotifyData.name}**.`));
            }
            else {
                return interaction.editReply(MusicEmbedBuilder.success("Spotify Track Added", `Enqueued Spotify track: **${spotifyData.name}**.`));
            }
        }
        // Determine initial search query (use ytmsearch with OAuth TV/WEB client)
        const searchQuery = /^(https?:\/\/|ytsearch:|ytmsearch:|scsearch:)/.test(query)
            ? query
            : `ytmsearch:${query}`;
        try {
            let result = await node.rest.resolve(searchQuery);
            // Fallback search logic if primary search encounters an error or returns empty
            if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
                let fallbackText = query;
                // If query is a YouTube URL, extract title via YouTube public oEmbed endpoint
                if (/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(query)) {
                    try {
                        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(query)}&format=json`);
                        if (oembedRes.ok) {
                            const oembedData = (await oembedRes.json());
                            if (oembedData.title) {
                                fallbackText = `${oembedData.author_name || ""} ${oembedData.title}`.trim();
                            }
                        }
                    }
                    catch (err) {
                        logger.error(`Error resolving YouTube oEmbed for ${query}:`, err);
                    }
                }
                const cleanSearch = fallbackText.replace(/https?:\/\/\S+/g, "").trim() || query;
                // Try SoundCloud search fallback
                result = await node.rest.resolve(`scsearch:${cleanSearch}`);
                // Try YouTube standard search fallback
                if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
                    result = await node.rest.resolve(`ytsearch:${cleanSearch}`);
                }
            }
            if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0) || result.loadType === "error" || result.loadType === "empty") {
                return interaction.editReply(MusicEmbedBuilder.error("Could not resolve or play this track from YouTube/SoundCloud. The source video may require login or age verification."));
            }
            const { loadType, data } = result;
            // Get or create queue
            let queue = client.queues.get(interaction.guildId);
            if (!queue) {
                // Join voice channel first
                const player = await client.shoukaku.joinVoiceChannel({
                    guildId: interaction.guildId,
                    channelId: voiceChannel.id,
                    shardId: interaction.guild?.shardId ?? 0,
                });
                queue = new Queue(client, player, interaction.guildId, interaction.channel);
                client.queues.set(interaction.guildId, queue);
            }
            if (loadType === "playlist") {
                const playlist = data; // Shoukaku Playlist data
                const tracks = playlist.tracks;
                for (const track of tracks) {
                    queue.addTrack(track, interaction.user.tag);
                }
                return interaction.editReply(MusicEmbedBuilder.success("Playlist Added", `Added **${tracks.length}** tracks from playlist **${playlist.info.name}** to the queue.`));
            }
            else if (loadType === "search" || loadType === "track") {
                const tracks = Array.isArray(data) ? data : [data];
                const track = tracks[0];
                queue.addTrack(track, interaction.user.tag);
                // If it's already playing, send a queue added message, otherwise nowPlaying handles it
                if (queue.current && queue.tracks.length > 0) {
                    return interaction.editReply(MusicEmbedBuilder.success("Track Added", `Added **[${track.info.title}](${track.info.uri || "#"})** to the queue.`));
                }
                // Edit reply with a loading/playing message (which will soon be updated by now playing event)
                return interaction.editReply(MusicEmbedBuilder.success("Playing Track", `Starting to play **[${track.info.title}](${track.info.uri || "#"})**.`));
            }
            else if (loadType === "empty") {
                return interaction.editReply(MusicEmbedBuilder.error("No results found for your query."));
            }
            else if (loadType === "error") {
                return interaction.editReply(MusicEmbedBuilder.error("Lavalink failed to load the track. The source might be blocked or unavailable."));
            }
            else {
                return interaction.editReply(MusicEmbedBuilder.error(`Could not load the track. Unknown load type: "${loadType}"`));
            }
        }
        catch (error) {
            logger.error("Error in play command:", error);
            return interaction.editReply(MusicEmbedBuilder.error("An error occurred while resolving the track."));
        }
    }
    async autocomplete(client, interaction) {
        const focusedValue = interaction.options.getFocused()?.trim();
        if (!focusedValue || focusedValue.length < 2) {
            return interaction.respond([]).catch(() => { });
        }
        const node = client.shoukaku.getIdealNode();
        if (!node)
            return interaction.respond([]).catch(() => { });
        try {
            // Timeout promise after 2000ms to guarantee response within Discord's 3s limit
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
            const searchPromise = (async () => {
                let res = await node.rest.resolve(`scsearch:${focusedValue}`);
                if (!res || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
                    res = await node.rest.resolve(`ytmsearch:${focusedValue}`);
                }
                return res;
            })();
            const result = (await Promise.race([searchPromise, timeoutPromise]));
            if (!result || !result.data || !Array.isArray(result.data)) {
                return interaction.respond([]).catch(() => { });
            }
            const choices = result.data.slice(0, 10).map((track) => {
                const title = track.info?.title || "Track";
                const author = track.info?.author || "";
                const label = author && author !== "Unknown Artist" ? `${title} - ${author}` : title;
                return {
                    name: label.substring(0, 100),
                    value: label.substring(0, 100),
                };
            });
            await interaction.respond(choices).catch(() => { });
        }
        catch (error) {
            await interaction.respond([]).catch(() => { });
        }
    }
}
