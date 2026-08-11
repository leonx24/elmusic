import { Interaction } from "discord.js";
import { Event } from "../../structures/Event.js";
import { BotClient } from "../../structures/BotClient.js";
import { logger } from "../../utils/logger.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";

export default class InteractionCreateEvent extends Event<"interactionCreate"> {
  constructor() {
    super("interactionCreate");
  }

  async run(client: BotClient, interaction: Interaction): Promise<unknown> {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        try {
          await command.autocomplete(client, interaction);
        } catch (error) {
          logger.error(`Error in autocomplete for command /${command.name}:`, error);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

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
    } catch (error) {
      logger.error(`Error running command /${command.name}:`, error);
      
      const errorMsg = MusicEmbedBuilder.error(
        "An unexpected error occurred while executing this command."
      );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ ...errorMsg, ephemeral: true });
      } else {
        await interaction.reply({ ...errorMsg, ephemeral: true });
      }
    }
  }
}
