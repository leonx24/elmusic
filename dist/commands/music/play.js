import { ApplicationCommandOptionType } from "discord.js";
import { Command } from "../../structures/Command.js";
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
                },
            ],
        });
    }
    async run(client, interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                embeds: [MusicEmbedBuilder.error("You must be in a voice channel to use this command.")],
                ephemeral: true,
            });
        }
        const selfMember = interaction.guild?.members.me;
        if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
            return interaction.reply({
                embeds: [MusicEmbedBuilder.error("I am already playing music in another voice channel.")],
                ephemeral: true,
            });
        }
        // Defer the reply because resolving search can take some time
        await interaction.deferReply();
        const query = interaction.options.getString("query", true);
        const node = client.shoukaku.getIdealNode();
        if (!node) {
            return interaction.editReply({
                embeds: [MusicEmbedBuilder.error("Lavalink node is not available. Please try again later.")],
            });
        }
        const searchQuery = /^https?:\/\//.test(query) ? query : `ytsearch:${query}`;
        try {
            const result = await node.rest.resolve(searchQuery);
            if (!result || !result.data || (Array.isArray(result.data) && result.data.length === 0)) {
                return interaction.editReply({
                    embeds: [MusicEmbedBuilder.error("No results found for your query.")],
                });
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
                return interaction.editReply({
                    embeds: [
                        MusicEmbedBuilder.success("Playlist Added", `Added **${tracks.length}** tracks from playlist **${playlist.info.name}** to the queue.`),
                    ],
                });
            }
            else if (loadType === "search" || loadType === "track") {
                const tracks = Array.isArray(data) ? data : [data];
                const track = tracks[0];
                queue.addTrack(track, interaction.user.tag);
                // If it's already playing, send a queue added message, otherwise nowPlaying handles it
                if (queue.current && queue.tracks.length > 0) {
                    return interaction.editReply({
                        embeds: [
                            MusicEmbedBuilder.success("Track Added", `Added **[${track.info.title}](${track.info.uri || "#"})** to the queue.`),
                        ],
                    });
                }
                // Edit reply with a loading/playing message (which will soon be updated by now playing event)
                return interaction.editReply({
                    embeds: [
                        MusicEmbedBuilder.success("Playing Track", `Starting to play **[${track.info.title}](${track.info.uri || "#"})**.`),
                    ],
                });
            }
            else {
                return interaction.editReply({
                    embeds: [MusicEmbedBuilder.error("Could not load the track. Unknown load type.")],
                });
            }
        }
        catch (error) {
            logger.error("Error in play command:", error);
            return interaction.editReply({
                embeds: [MusicEmbedBuilder.error("An error occurred while resolving the track.")],
            });
        }
    }
}
