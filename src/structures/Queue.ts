import { GuildTextBasedChannel, Routes } from "discord.js";
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
  public twentyFourSeven = false;
  public autoplay = false;
  public lyricsInterval: NodeJS.Timeout | null = null;

  constructor(client: BotClient, player: Player, guildId: string, textChannel: GuildTextBasedChannel) {
    this.client = client;
    this.player = player;
    this.guildId = guildId;
    this.textChannel = textChannel;

    // Listen to Shoukaku Player Events
    this.player.on("start", () => this.onTrackStart());
    this.player.on("end", (reason) => this.onTrackEnd(reason));
    this.player.on("exception", (error) => this.onPlayerError(error));
    
    // Only destroy queue on closed event if NOT in 24/7 mode
    this.player.on("closed", () => {
      logger.warn(`Player connection closed in guild ${this.guildId}.`);
      if (!this.twentyFourSeven) {
        this.destroy();
      }
    });
  }

  public addTrack(track: any, requester: string) {
    const trackWithRequester = { ...track, requester };
    this.tracks.push(trackWithRequester);
    if (!this.current) {
      this.playNext();
    }
  }

  public async playNext() {
    if (this.lyricsInterval) {
      clearInterval(this.lyricsInterval);
      this.lyricsInterval = null;
    }

    if (this.tracks.length === 0) {
      this.current = null;
      this.updateVoiceChannelStatus("");
      this.textChannel.send(MusicEmbedBuilder.success("Queue Finished", "No more tracks to play. Use `/leave` to disconnect me from the voice channel.")).catch(() => {});
      return;
    }

    this.current = this.tracks.shift();
    try {
      const encodedTrack = this.current.encoded || this.current.track;
      await this.player.playTrack({ track: { encoded: encodedTrack } });
    } catch (error) {
      logger.error(`Error playing track in guild ${this.guildId}:`, error);
      this.textChannel.send(MusicEmbedBuilder.error("Could not play the next track.")).catch(() => {});
      this.playNext();
    }
  }

  public async skip() {
    try {
      await this.player.stopTrack();
    } catch (error) {
      logger.error(`Error skipping track in guild ${this.guildId}:`, error);
    }
  }

  public async stop() {
    this.tracks = [];
    try {
      await this.player.stopTrack();
    } catch (error) {
      logger.error(`Error stopping track in guild ${this.guildId}:`, error);
    }
  }

  public async setVolume(level: number) {
    // Shoukaku v4 setGlobalVolume changes player volume level (0 to 1000)
    await this.player.setGlobalVolume(level);
  }

  private onTrackStart() {
    if (!this.current) return;
    
    const trackInfo = this.current.info;
    const requester = this.current.requester;
    
    this.updateVoiceChannelStatus(`${trackInfo.title} - ${trackInfo.author}`.substring(0, 50));

    this.textChannel.send(
      MusicEmbedBuilder.nowPlaying(trackInfo, requester, this.player.paused, this.autoplay)
    ).catch(() => {});
  }

  private async onTrackEnd(reason: any) {
    logger.info(`Track ended in guild ${this.guildId}. Reason: ${reason.reason}`);
    
    // Handle loop status
    if (this.current) {
      if (this.loop === "track") {
        this.tracks.unshift(this.current);
      } else if (this.loop === "queue") {
        this.tracks.push(this.current);
      }
    }

    // Autoplay logic if queue is empty
    if (this.tracks.length === 0 && this.autoplay && this.current) {
      try {
        const lastTitle = this.current.info.title;
        const lastAuthor = this.current.info.author;
        const node = this.client.shoukaku.getIdealNode();
        if (node) {
          const res = await node.rest.resolve(`ytmsearch:${lastAuthor} - ${lastTitle} mix`);
          if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
            const nextTrack = res.data.find((t: any) => t.info?.identifier !== this.current.info?.identifier) || res.data[0];
            if (nextTrack) {
              this.tracks.push({ ...nextTrack, requester: "Autoplay" });
              this.textChannel.send(
                MusicEmbedBuilder.success("Autoplay", `Autoplay queued next song: **[${nextTrack.info.title}](${nextTrack.info.uri || "#"})**`)
              ).catch(() => {});
            }
          }
        }
      } catch (err) {
        logger.error(`Autoplay resolution failed in guild ${this.guildId}:`, err);
      }
    }

    this.playNext();
  }

  private async onPlayerError(error: any) {
    logger.error(`Lavalink Player error in guild ${this.guildId}:`, error);

    // Automatic SoundCloud fallback for YouTube stream errors
    if (this.current && !this.current._isFallback) {
      this.current._isFallback = true;
      try {
        let title = this.current.info?.title || "";
        let author = this.current.info?.author || "";
        if (author === "Unknown Artist") author = "";
        const searchQuery = `${author} ${title}`.trim();
        const node = this.client.shoukaku.getIdealNode();
        if (node && searchQuery.length > 0) {
          logger.info(`Attempting SoundCloud stream fallback for "${searchQuery}"...`);
          const res = await node.rest.resolve(`scsearch:${searchQuery}`);
          if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
            const fallbackTrack = { ...res.data[0], requester: this.current.requester, _isFallback: true };
            this.current = fallbackTrack;
            const encodedTrack = fallbackTrack.encoded || (fallbackTrack as any).track;
            await this.player.playTrack({ track: { encoded: encodedTrack } });
            return;
          }
        }
      } catch (fallbackErr) {
        logger.error(`SoundCloud fallback failed for guild ${this.guildId}:`, fallbackErr);
      }
    }

    this.textChannel.send(MusicEmbedBuilder.error("Could not stream this track from YouTube or SoundCloud.")).catch(() => {});
    this.playNext();
  }

  private async updateVoiceChannelStatus(statusText: string) {
    try {
      const guild = this.client.guilds.cache.get(this.guildId);
      const voiceChannelId = guild?.members.me?.voice.channelId;
      if (voiceChannelId) {
        await this.client.rest.put(Routes.channelVoiceStatus(voiceChannelId), {
          body: { status: statusText },
        });
      }
    } catch (err) {
      // Silently catch if bot lacks permission or status update fails
    }
  }

  public destroy() {
    if (this.lyricsInterval) {
      clearInterval(this.lyricsInterval);
      this.lyricsInterval = null;
    }
    this.updateVoiceChannelStatus("");
    logger.info(`Destroying queue and leaving channel for guild ${this.guildId}`);
    this.client.shoukaku.leaveVoiceChannel(this.guildId).catch(() => {});
    this.client.queues.delete(this.guildId);
  }
}
