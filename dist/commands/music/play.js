import { ApplicationCommandOptionType } from "discord.js";
import { Command } from "../../structures/Command.js";
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
        const rawQuery = interaction.options.getString("query", true);
        await interaction.deferReply();
        try {
            // Resolve query with Spotify-first if it's a search term
            const queryToPlay = await resolveQuery(rawQuery);
            await client.distube.play(voiceChannel, queryToPlay, {
                member,
                textChannel: interaction.channel,
            });
            return interaction.editReply(MusicEmbedBuilder.success("Queued Request", `🔍 Searching and adding **${rawQuery}** to the queue...`));
        }
        catch (err) {
            logger.error(`Error in /play command for "${rawQuery}":`, err);
            return interaction.editReply(MusicEmbedBuilder.error(`Failed to play song: ${err.message || err}`));
        }
    }
}
