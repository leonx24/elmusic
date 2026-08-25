import { Client, ClientOptions, Collection, GatewayIntentBits } from "discord.js";
import { Shoukaku, Connectors } from "shoukaku";
import { Command } from "./Command.js";
import { Queue } from "./Queue.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BotClient extends Client {
  public commands = new Collection<string, Command>();
  public aliases = new Collection<string, string>();
  public queues = new Collection<string, Queue>();
  public shoukaku: Shoukaku;

  constructor(options?: ClientOptions) {
    super(options || {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Initialize Shoukaku (Lavalink Manager)
    this.shoukaku = new Shoukaku(
      new Connectors.DiscordJS(this),
      config.lavalink,
      {
        moveOnDisconnect: true,
        resume: true,
        resumeTimeout: 60,
        reconnectTries: 50,
        reconnectInterval: 5000,
      }
    );

    // Setup Shoukaku Event Listeners
    this.setupShoukakuEvents();
  }

  private setupShoukakuEvents() {
    this.shoukaku.on("ready", (name) => {
      logger.info(`Lavalink Node "${name}" connected successfully.`);
    });

    this.shoukaku.on("error", (name, error) => {
      logger.error(`Lavalink Node "${name}" encountered an error:`, error);
    });

    this.shoukaku.on("close", (name, code, reason) => {
      logger.warn(`Lavalink Node "${name}" connection closed. Code: ${code}, Reason: ${reason}`);
    });

    this.shoukaku.on("disconnect", (name, count) => {
      logger.warn(`Lavalink Node "${name}" disconnected. Reconnect count: ${count}`);
    });
  }

  public async start() {
    logger.info("Initializing bot setup...");
    await this.loadCommands();
    await this.loadEvents();
    await this.login(config.token);
  }

  private async loadCommands() {
    const commandsPath = path.join(__dirname, "..", "commands");
    if (!fs.existsSync(commandsPath)) return;

    const categories = fs.readdirSync(commandsPath);
    for (const category of categories) {
      const categoryPath = path.join(commandsPath, category);
      if (!fs.statSync(categoryPath).isDirectory()) continue;

      const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));
      for (const file of commandFiles) {
        const filePath = path.join(categoryPath, file);
        // Using pathToFileURL to ensure ES Modules dynamic import works correctly across systems
        const fileUrl = pathToFileURL(filePath).href;
        try {
          const imported = await import(fileUrl);
          const CommandClass = imported.default || Object.values(imported)[0];
          
          if (CommandClass && typeof CommandClass === "function") {
            const cmd: Command = new (CommandClass as any)();
            this.commands.set(cmd.name, cmd);
            if (cmd.aliases && Array.isArray(cmd.aliases)) {
              for (const alias of cmd.aliases) {
                this.aliases.set(alias.toLowerCase(), cmd.name);
              }
            }
            logger.info(`Loaded command: [${category}] /${cmd.name}`);
          }
        } catch (error) {
          logger.error(`Failed to load command at ${fileUrl}:`, error);
        }
      }
    }
  }

  private async loadEvents() {
    const eventsPath = path.join(__dirname, "..", "events");
    if (!fs.existsSync(eventsPath)) return;

    // Load subfolders under events/ (e.g. client, lavalink)
    const eventFolders = fs.readdirSync(eventsPath);
    for (const folder of eventFolders) {
      const folderPath = path.join(eventsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const eventFiles = fs.readdirSync(folderPath).filter(file => file.endsWith(".ts") || file.endsWith(".js"));
      for (const file of eventFiles) {
        const filePath = path.join(folderPath, file);
        const fileUrl = pathToFileURL(filePath).href;
        try {
          const imported = await import(fileUrl);
          const EventClass = imported.default || Object.values(imported)[0];

          if (EventClass && typeof EventClass === "function") {
            const eventInstance = new (EventClass as any)();
            if (folder === "client") {
              this.on(eventInstance.name, (...args) => eventInstance.run(this, ...args));
              logger.info(`Loaded client event: ${eventInstance.name}`);
            }
          }
        } catch (error) {
          logger.error(`Failed to load event at ${fileUrl}:`, error);
        }
      }
    }
  }
}
