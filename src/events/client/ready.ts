import { Event } from "../../structures/Event.js";
import { BotClient } from "../../structures/BotClient.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config.js";
import { ActivityType } from "discord.js";

export default class ReadyEvent extends Event<"ready"> {
  constructor() {
    super("ready");
  }

  async run(client: BotClient): Promise<unknown> {
    logger.info(`Discord Bot logged in as ${client.user?.tag}`);

    // Set custom status/presence like HD Music
    client.user?.setPresence({
      activities: [{ name: "🎵 Music on leon x server", type: ActivityType.Listening }],
      status: "online",
    });

    // Format commands array for registration
    const commandsData = Array.from(client.commands.values()).map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      options: cmd.options,
    }));

    try {
      if (config.guildId) {
        logger.info(`Registering Slash Commands locally for Guild ID: ${config.guildId}`);
        const guild = await client.guilds.fetch(config.guildId);
        if (guild) {
          await guild.commands.set(commandsData);
          logger.info(`Successfully registered ${commandsData.length} Guild Slash Commands.`);
        } else {
          logger.error(`Guild with ID ${config.guildId} not found.`);
        }
        
        // Clear global commands to prevent duplicate display
        logger.info("Clearing global commands...");
        await client.application?.commands.set([]);
      } else {
        logger.info(`Registering Slash Commands globally...`);
        await client.application?.commands.set(commandsData);
        logger.info(`Successfully registered ${commandsData.length} Global Slash Commands.`);
      }
    } catch (err) {
      logger.error("Failed to register Slash Commands:", err);
    }

    return;
  }
}
