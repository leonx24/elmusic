import { ClientEvents } from "discord.js";
import { BotClient } from "./BotClient.js";

export abstract class Event<Key extends keyof ClientEvents = keyof ClientEvents> {
  public name: Key;

  constructor(name: Key) {
    this.name = name;
  }

  abstract run(client: BotClient, ...args: ClientEvents[Key]): Promise<unknown>;
}
