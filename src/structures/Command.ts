import { ChatInputCommandInteraction, ApplicationCommandOptionData, AutocompleteInteraction } from "discord.js";
import { BotClient } from "./BotClient.js";

export interface CommandOptions {
  name: string;
  description: string;
  aliases?: string[];
  options?: ApplicationCommandOptionData[];
}

export abstract class Command {
  public name: string;
  public description: string;
  public aliases: string[];
  public options: ApplicationCommandOptionData[];

  constructor(options: CommandOptions) {
    this.name = options.name;
    this.description = options.description;
    this.aliases = options.aliases || [];
    this.options = options.options || [];
  }

  abstract run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown>;

  async autocomplete?(client: BotClient, interaction: AutocompleteInteraction): Promise<unknown> {
    return;
  }
}
