import { Event } from "../../structures/Event.js";
import { logger } from "../../utils/logger.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
export default class InteractionCreateEvent extends Event {
    constructor() {
        super("interactionCreate");
    }
    async run(client, interaction) {
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command && command.autocomplete) {
                try {
                    await command.autocomplete(client, interaction);
                }
                catch (error) {
                    logger.error(`Error in autocomplete for command /${command.name}:`, error);
                }
            }
            return;
        }
        if (interaction.isButton()) {
            const customId = interaction.customId;
            if (!customId.startsWith("music_"))
                return;
            const member = interaction.member;
            const voiceChannel = member?.voice?.channel;
            if (!voiceChannel) {
                return interaction.reply({
                    ...MusicEmbedBuilder.error("You must be in a voice channel to use music controls."),
                    ephemeral: true,
                });
            }
            const queue = client.queues.get(interaction.guildId);
            if (!queue || !queue.current) {
                return interaction.reply({
                    ...MusicEmbedBuilder.error("There is no active music player in this server."),
                    ephemeral: true,
                });
            }
            const selfMember = interaction.guild?.members.me;
            if (selfMember?.voice.channel && selfMember.voice.channel.id !== voiceChannel.id) {
                return interaction.reply({
                    ...MusicEmbedBuilder.error("You must be in the same voice channel as the bot to use music controls."),
                    ephemeral: true,
                });
            }
            try {
                if (customId === "music_pause_resume") {
                    const isPaused = queue.player.paused;
                    await queue.player.setPaused(!isPaused);
                    return interaction.reply({
                        ...MusicEmbedBuilder.success(isPaused ? "Resumed" : "Paused", `Playback has been ${isPaused ? "resumed" : "paused"}.`),
                        ephemeral: true,
                    });
                }
                else if (customId === "music_skip") {
                    const currentTitle = queue.current?.info?.title || "track";
                    await queue.skip();
                    return interaction.reply({
                        ...MusicEmbedBuilder.success("Skipped", `Skipped **${currentTitle}**.`),
                        ephemeral: true,
                    });
                }
                else if (customId === "music_autoplay") {
                    queue.autoplay = !queue.autoplay;
                    const status = queue.autoplay ? "ENABLED" : "DISABLED";
                    return interaction.reply({
                        ...MusicEmbedBuilder.success(`Autoplay: ${status}`, `Autoplay mode is now ${status}.`),
                        ephemeral: true,
                    });
                }
                else if (customId === "music_stop") {
                    queue.destroy();
                    return interaction.reply({
                        ...MusicEmbedBuilder.success("Stopped", "Stopped music playback and left the voice channel."),
                        ephemeral: true,
                    });
                }
            }
            catch (err) {
                logger.error(`Error handling button ${customId}:`, err);
            }
            return;
        }
        if (!interaction.isChatInputCommand())
            return;
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            return interaction.reply({
                ...MusicEmbedBuilder.error(`Command "/${interaction.commandName}" not found.`),
                ephemeral: true,
            });
        }
        try {
            logger.info(`User ${interaction.user.tag} ran command /${command.name} in guild: ${interaction.guild?.name || "DM"}`);
            await command.run(client, interaction);
        }
        catch (error) {
            logger.error(`Error running command /${command.name}:`, error);
            const errorMsg = MusicEmbedBuilder.error("An unexpected error occurred while executing this command.");
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ ...errorMsg, ephemeral: true });
            }
            else {
                await interaction.reply({ ...errorMsg, ephemeral: true });
            }
        }
    }
}
