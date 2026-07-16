import { GuildTextBasedChannel } from "discord.js";
import { Player } from "shoukaku";
import { BotClient } from "./BotClient.js";
import { MusicEmbedBuilder } from "../utils/embed.js";
import { logger } from "../utils/logger.js";

export class Queue {
  public client: BotClient;
  public player: Player;
  public guildId: string;
  public textChannel: GuildTextBasedChannel;
  public tracks: any[] = [];
  public current: any = null;
  public loop: "none" | "track" | "queue" = "none";

  constructor(client: BotClient, player: Player, guildId: string, textChannel: GuildTextBasedChannel) {
    this.client = client;
    this.player = player;
    this.guildId = guildId;
    this.textChannel = textChannel;

    // Listen to Shoukaku Player Events
    this.player.on("start", () => this.onTrackStart());
    this.player.on("end", (reason) => this.onTrackEnd(reason));
    this.player.on("exception", (error) => this.onPlayerError(error));
    this.player.on("closed", () => this.destroy());
  }

  public addTrack(track: any, requester: string) {
    // Save the requester info inside the track object for visualization
    const trackWithRequester = { ...track, requester };
    this.tracks.push(trackWithRequester);
    if (!this.current) {
      this.playNext();
    }
  }

  public async playNext() {
    if (this.tracks.length === 0) {
      this.current = null;
      this.textChannel.send({
        embeds: [MusicEmbedBuilder.success("Queue Finished", "No more tracks to play. Leaving the voice channel.")]
      }).catch(() => {});
      this.destroy();
      return;
    }

    this.current = this.tracks.shift();
    try {
      // Shoukaku's playTrack method takes the track's base64/encoded string (track.track or track.encoded)
      const encodedTrack = this.current.track || this.current.encoded;
      await this.player.playTrack({ track: encodedTrack });
    } catch (error) {
      logger.error(`Error playing track in guild ${this.guildId}:`, error);
      this.textChannel.send({
        embeds: [MusicEmbedBuilder.error("Could not play the next track.")]
      }).catch(() => {});
      this.playNext();
    }
  }

  public skip() {
    this.player.stopTrack();
  }

  public stop() {
    this.tracks = [];
    this.player.stopTrack();
  }

  private onTrackStart() {
    if (!this.current) return;
    
    // Send standard Jockie/HD style Now Playing Rich Embed
    const trackInfo = this.current.info;
    const requester = this.current.requester;
    
    this.textChannel.send({
      embeds: [MusicEmbedBuilder.nowPlaying(trackInfo, requester)]
    }).catch(() => {});
  }

  private onTrackEnd(reason: any) {
    logger.info(`Track ended in guild ${this.guildId}. Reason: ${reason.reason}`);
    
    // Handle loop status
    if (this.current) {
      if (this.loop === "track") {
        this.tracks.unshift(this.current);
      } else if (this.loop === "queue") {
        this.tracks.push(this.current);
      }
    }

    // Auto play next track
    this.playNext();
  }

  private onPlayerError(error: any) {
    logger.error(`Lavalink Player error in guild ${this.guildId}:`, error);
    this.textChannel.send({
      embeds: [MusicEmbedBuilder.error("An error occurred with the Lavalink player.")]
    }).catch(() => {});
  }

  public destroy() {
    logger.info(`Destroying queue and leaving channel for guild ${this.guildId}`);
    this.client.shoukaku.leaveVoiceChannel(this.guildId).catch(() => {});
    // Clear queue references
    (this.client as any).queues?.delete(this.guildId);
  }
}
