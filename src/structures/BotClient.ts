import { Client, ClientOptions, Collection, GatewayIntentBits, GuildTextBasedChannel } from "discord.js";
import { DisTube, Events, Queue, Song, Playlist } from "distube";
import { SpotifyPlugin } from "@distube/spotify";
import { YtDlpPlugin } from "@distube/yt-dlp";
import { Command } from "./Command.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { MusicEmbedBuilder } from "../utils/embed.js";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BotClient extends Client {
  public commands = new Collection<string, Command>();
  public aliases = new Collection<string, string>();
  public distube: DisTube;
  public twentyFourSevenGuilds = new Set<string>();

  constructor(options?: ClientOptions) {
    super(options || {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    // Write YouTube cookies from environment variable if provided
    this.setupCookies();

    // Prepare DisTube plugins
    const plugins: any[] = [];

    // 1. Spotify Plugin for resolving Spotify track/playlist metadata
    plugins.push(
      new SpotifyPlugin(
        config.spotify.clientId && config.spotify.clientSecret
          ? {
              api: {
                clientId: config.spotify.clientId,
                clientSecret: config.spotify.clientSecret,
              },
            }
          : undefined
      )
    );

    // 2. YtDlp Plugin for extracting audio streams
    plugins.push(
      new YtDlpPlugin({
        update: false,
      })
    );

    // Initialize DisTube
    this.distube = new DisTube(this, {
      plugins,
      emitNewSongOnly: true,
      emitAddSongWhenCreatingQueue: false,
      emitAddListWhenCreatingQueue: false,
    });

    // Setup DisTube event listeners
    this.setupDisTubeEvents();
  }

  private setupCookies() {
    if (config.youtubeCookies) {
      try {
        const cookiePath = "/tmp/cookies.txt";
        fs.writeFileSync(cookiePath, config.youtubeCookies, "utf8");
        logger.info("YouTube cookies successfully written to /tmp/cookies.txt");

        // Write yt-dlp config to default config path so yt-dlp binary automatically uses it
        const ytDlpConfigDir = path.join(os.homedir(), ".config", "yt-dlp");
        if (!fs.existsSync(ytDlpConfigDir)) {
          fs.mkdirSync(ytDlpConfigDir, { recursive: true });
        }
        const ytDlpConfigFile = path.join(ytDlpConfigDir, "config");
        fs.writeFileSync(ytDlpConfigFile, `--cookies ${cookiePath}\n`, "utf8");
        logger.info(`yt-dlp default config written with --cookies ${cookiePath}`);
      } catch (err) {
        logger.warn("Failed to write YouTube cookies:", err);
      }
    }
  }

  private setupDisTubeEvents() {
    this.distube
      .on(Events.PLAY_SONG, (queue: Queue, song: Song) => {
        logger.info(`[DisTube] Playing "${song.name}" in guild "${queue.voiceChannel?.guild.name}"`);
        const textChannel = queue.textChannel as GuildTextBasedChannel | undefined;
        if (textChannel) {
          textChannel.send({
            ...MusicEmbedBuilder.nowPlaying(
              {
                title: song.name || "Unknown Track",
                uri: song.url,
                author: song.uploader?.name || "YouTube",
                length: song.duration * 1000,
              },
              song.user?.tag || "Unknown User",
              queue.paused,
              queue.autoplay
            ),
          }).catch(() => {});
        }
      })
      .on(Events.ADD_SONG, (queue: Queue, song: Song) => {
        logger.info(`[DisTube] Added "${song.name}" to queue in guild "${queue.voiceChannel?.guild.name}"`);
        const textChannel = queue.textChannel as GuildTextBasedChannel | undefined;
        if (textChannel) {
          textChannel.send(
            MusicEmbedBuilder.success(
              "Added to Queue",
              `[**${song.name}**](${song.url}) \`[${song.formattedDuration}]\` - Requested by ${song.user || "User"}`
            )
          ).catch(() => {});
        }
      })
      .on(Events.ADD_LIST, (queue: Queue, playlist: Playlist) => {
        logger.info(`[DisTube] Added playlist "${playlist.name}" (${playlist.songs.length} tracks) in guild "${queue.voiceChannel?.guild.name}"`);
        const textChannel = queue.textChannel as GuildTextBasedChannel | undefined;
        if (textChannel) {
          textChannel.send(
            MusicEmbedBuilder.success(
              "Playlist Queued",
              `Queued playlist [**${playlist.name}**](${playlist.url || "https://spotify.com"}) with **${playlist.songs.length}** songs.`
            )
          ).catch(() => {});
        }
      })
      .on(Events.FINISH, (queue: Queue) => {
        logger.info(`[DisTube] Queue finished in guild "${queue.voiceChannel?.guild.name}"`);
        const guildId = queue.voiceChannel?.guild.id;
        const textChannel = queue.textChannel as GuildTextBasedChannel | undefined;

        if (textChannel) {
          textChannel.send(
            MusicEmbedBuilder.info("Queue Finished", "All songs have finished playing.")
          ).catch(() => {});
        }

        // If not 24/7 mode, leave after a delay
        if (guildId && !this.twentyFourSevenGuilds.has(guildId)) {
          setTimeout(() => {
            const currentQueue = this.distube.getQueue(guildId);
            if (!currentQueue || currentQueue.songs.length === 0) {
              this.distube.voices.leave(guildId);
            }
          }, 30000);
        }
      })
      .on(Events.DISCONNECT, (queue: Queue) => {
        logger.info(`[DisTube] Disconnected from voice channel in guild "${queue.voiceChannel?.guild.name}"`);
      })
      .on(Events.ERROR, (error: Error, queue: Queue, song?: Song) => {
        logger.error(`[DisTube Error] in guild "${queue?.voiceChannel?.guild.name || "Unknown"}":`, error);
        const textChannel = queue?.textChannel as GuildTextBasedChannel | undefined;
        if (textChannel) {
          textChannel.send(
            MusicEmbedBuilder.error(`An error occurred while playing **${song?.name || "track"}**: ${error.message}`)
          ).catch(() => {});
        }
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
