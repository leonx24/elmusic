import { Message, GuildMember, GuildTextBasedChannel } from "discord.js";
import { Event } from "../../structures/Event.js";
import { BotClient } from "../../structures/BotClient.js";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import { buildV2Container } from "../../utils/components-v2.js";

export default class MessageCreateEvent extends Event<"messageCreate"> {
  constructor() {
    super("messageCreate");
  }

  async run(client: BotClient, message: Message): Promise<unknown> {
    if (message.author.bot || !message.guild) return;

    const prefix = config.prefix;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandInput = args.shift()?.toLowerCase();
    if (!commandInput) return;

    // Resolve command or alias
    const commandName = client.commands.has(commandInput)
      ? commandInput
      : client.aliases.get(commandInput);

    if (!commandName) return;

    const command = client.commands.get(commandName);
    if (!command) return;

    logger.info(`User ${message.author.tag} ran prefix command ${prefix}${commandInput} in guild: ${message.guild.name}`);

    // Create a mock interaction adapter so existing Slash Command classes run seamlessly
    let deferredMsg: Message | null = null;

    const mockInteraction: any = {
      guild: message.guild,
      guildId: message.guildId,
      member: message.member as GuildMember,
      user: message.author,
      channel: message.channel as GuildTextBasedChannel,
      options: {
        getString: (name: string) => {
          const raw = args.join(" ").trim();
          return raw.length > 0 ? raw : null;
        },
        getInteger: (name: string) => {
          const num = parseInt(args[0], 10);
          return isNaN(num) ? null : num;
        },
        getFocused: () => args.join(" ").trim(),
      },
      deferReply: async () => {
        try {
          deferredMsg = await message.reply(
            buildV2Container({
              title: "Processing",
              description: "Resolving request...",
            })
          );
        } catch {
          // Fallback if message reply fails
        }
      },
      reply: async (payload: any) => {
        if (typeof payload === "string") {
          return message.reply(payload);
        }
        return message.reply(payload);
      },
      editReply: async (payload: any) => {
        if (deferredMsg) {
          try {
            return await deferredMsg.edit(payload);
          } catch {
            return message.reply(payload);
          }
        }
        return message.reply(payload);
      },
    };

    try {
      await command.run(client, mockInteraction);
    } catch (error) {
      logger.error(`Error executing prefix command ${prefix}${commandInput}:`, error);
      message.reply(
        buildV2Container({
          title: "Error",
          description: "An error occurred while executing this command.",
        })
      ).catch(() => {});
    }
  }
}
