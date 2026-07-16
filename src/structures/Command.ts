import { ChatInputCommandInteraction, ApplicationCommandOptionData } from "discord.js";
import { BotClient } from "./BotClient.js";

export interface CommandOptions {
  name: string;
  description: string;
  options?: ApplicationCommandOptionData[];
}

export abstract class Command {
  public name: string;
  public description: string;
  public options: ApplicationCommandOptionData[];

  constructor(options: CommandOptions) {
    this.name = options.name;
    this.description = options.description;
    this.options = options.options || [];
  }

  abstract run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown>;
}
