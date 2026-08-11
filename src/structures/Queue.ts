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

  public playedHistory: Set<string> = new Set();
  public playedAuthors: Set<string> = new Set();
  private autoplayFailures = 0;
  private lastAutoplayTime = 0;

  private cleanTitle(title: string): string {
    return (title || "")
      .toLowerCase()
      .replace(/\(official\s*(music\s*)?video\)/gi, "")
      .replace(/\(audio\)/gi, "")
      .replace(/\(lyric\s*video\)/gi, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .trim();
  }

  private cleanAuthor(author: string): string {
    return (author || "")
      .toLowerCase()
      .replace(/\s*-\s*topic$/i, "")
      .replace(/\s*vevo$/i, "")
      .replace(/official/i, "")
      .replace(/records/i, "")
      .trim();
  }

  private onTrackStart() {
    if (!this.current) return;
    
    const trackInfo = this.current.info;
    const requester = this.current.requester;

    // Track played history to avoid looping in autoplay
    if (trackInfo.identifier) this.playedHistory.add(trackInfo.identifier);
    const cleaned = this.cleanTitle(trackInfo.title);
    if (cleaned) this.playedHistory.add(cleaned);
    if (this.playedHistory.size > 100) {
      const firstKey = this.playedHistory.values().next().value;
      if (firstKey) this.playedHistory.delete(firstKey);
    }

    const cleanedAuthor = this.cleanAuthor(trackInfo.author);
    if (cleanedAuthor) this.playedAuthors.add(cleanedAuthor);
    if (this.playedAuthors.size > 50) {
      const firstAuthor = this.playedAuthors.values().next().value;
      if (firstAuthor) this.playedAuthors.delete(firstAuthor);
    }
    
    this.updateVoiceChannelStatus(`${trackInfo.title} - ${trackInfo.author}`.substring(0, 50));

    this.textChannel.send(
      MusicEmbedBuilder.nowPlaying(trackInfo, requester, this.player.paused, this.autoplay)
    ).catch(() => {});
  }

  private async onTrackEnd(reason: any) {
    const endReason = (typeof reason === "string" ? reason : reason?.reason || "").toLowerCase();
    logger.info(`Track ended in guild ${this.guildId}. Reason: ${endReason}`);
    
    // Ignore end event if track was replaced, cleaned up, or failed (loadFailed is handled by onPlayerError)
    if (endReason === "replaced" || endReason === "cleanup" || endReason === "loadfailed" || endReason === "failed") {
      return;
    }

    // Handle loop status
    if (this.current) {
      if (this.loop === "track") {
        this.tracks.unshift(this.current);
      } else if (this.loop === "queue") {
        this.tracks.push(this.current);
      }
    }

    // Autoplay logic if queue is empty (YouTube/Spotify style continuous autoplay)
    if (this.tracks.length === 0 && this.autoplay && this.current && this.loop === "none") {
      try {
        const now = Date.now();
        if (now - this.lastAutoplayTime < 10000) {
          this.autoplayFailures++;
        } else {
          this.autoplayFailures = 0;
        }
        this.lastAutoplayTime = now;

        if (this.autoplayFailures >= 3) {
          logger.warn(`Autoplay halted due to rapid successive track ends in guild ${this.guildId}`);
          this.autoplay = false;
          this.autoplayFailures = 0;
          this.textChannel.send(
            MusicEmbedBuilder.error("Autoplay paused because tracks ended too quickly. Use `/autoplay` to re-enable.")
          ).catch(() => {});
          this.playNext();
          return;
        }

        const lastTitle = this.current.info.title || "";
        const lastAuthor = this.current.info.author || "";
        const cleanedLastTitle = this.cleanTitle(lastTitle);
        const cleanedLastAuthor = this.cleanAuthor(lastAuthor);
        const node = this.client.shoukaku.getIdealNode();

        if (node) {
          // Search strategies for related songs (mix/radio to find similar songs by DIFFERENT artists)
          const searchQueries = [
            `ytmsearch:${cleanedLastTitle} mix`,
            `ytmsearch:${cleanedLastTitle} radio`,
            `ytmsearch:${cleanedLastAuthor} radio`,
            `scsearch:${cleanedLastTitle} mix`,
            `ytmsearch:${cleanedLastTitle}`
          ];

          let nextTrack: any = null;

          // First pass: Find a song by a DIFFERENT artist that hasn't been played recently
          for (const query of searchQueries) {
            const res = await node.rest.resolve(query);
            if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
              const candidate = res.data.find((t: any) => {
                if (!t.info) return false;
                const id = t.info.identifier;
                const title = t.info.title || "";
                const author = t.info.author || "";
                const clean = this.cleanTitle(title);
                const cleanAuthor = this.cleanAuthor(author);

                // Skip if track or title already in history
                if (id && this.playedHistory.has(id)) return false;
                if (clean && this.playedHistory.has(clean)) return false;

                // Skip if title is practically identical to last title
                if (clean && cleanedLastTitle && (clean.includes(cleanedLastTitle) || cleanedLastTitle.includes(clean))) {
                  return false;
                }

                // DIVERSE ARTIST CHECK: Skip if candidate is by the same author
                if (cleanedLastAuthor && cleanAuthor && (cleanAuthor.includes(cleanedLastAuthor) || cleanedLastAuthor.includes(cleanAuthor))) {
                  return false;
                }

                // Prefer artists not recently played
                if (cleanAuthor && this.playedAuthors.has(cleanAuthor)) {
                  return false;
                }

                return true;
              });

              if (candidate) {
                nextTrack = candidate;
                break;
              }
            }
          }

          // Second pass fallback: If strict artist diversity didn't find a candidate, allow non-recent author but still exclude exact same author
          if (!nextTrack) {
            for (const query of searchQueries) {
              const res = await node.rest.resolve(query);
              if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                const candidate = res.data.find((t: any) => {
                  if (!t.info) return false;
                  const id = t.info.identifier;
                  const title = t.info.title || "";
                  const author = t.info.author || "";
                  const clean = this.cleanTitle(title);
                  const cleanAuthor = this.cleanAuthor(author);

                  if (id && this.playedHistory.has(id)) return false;
                  if (clean && this.playedHistory.has(clean)) return false;
                  if (cleanedLastAuthor && cleanAuthor && (cleanAuthor.includes(cleanedLastAuthor) || cleanedLastAuthor.includes(cleanAuthor))) {
                    return false;
                  }
                  return true;
                });

                if (candidate) {
                  nextTrack = candidate;
                  break;
                }
              }
            }
          }

          if (nextTrack) {
            this.tracks.push({ ...nextTrack, requester: "Autoplay" });
            this.textChannel.send(
              MusicEmbedBuilder.success("Autoplay Next", `Playing next related song: **[${nextTrack.info.title}](${nextTrack.info.uri || "#"})** by **${nextTrack.info.author}**`)
            ).catch(() => {});
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

    // Snapshot current to avoid null-ref if track ends while fallback is async
    const current = this.current;

    // Automatic fallback for YouTube/SoundCloud stream errors
    if (current && !current._isFallback) {
      current._isFallback = true;
      if (this.current) this.current._isFallback = true;
      try {
        let title = current.info?.title || "";
        let author = current.info?.author || "";
        if (author === "Unknown Artist") author = "";
        const searchQuery = `${author} ${title}`.trim();
        const node = this.client.shoukaku.getIdealNode();
        if (node && searchQuery.length > 0) {
          logger.info(`Attempting stream fallback for "${searchQuery}"...`);
          let res = await node.rest.resolve(`scsearch:${searchQuery}`);
          if (!res || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
            res = await node.rest.resolve(`ytmsearch:${searchQuery}`);
          }
          if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
            const fallbackCandidate = res.data.find((t: any) => t.info?.identifier !== current.info?.identifier) || res.data[0];
            if (fallbackCandidate && fallbackCandidate.info?.identifier !== current.info?.identifier) {
              const fallbackTrack = { ...fallbackCandidate, requester: current.requester, _isFallback: true };
              this.current = fallbackTrack;
              const encodedTrack = fallbackTrack.encoded || (fallbackTrack as any).track;
              await this.player.playTrack({ track: { encoded: encodedTrack } });
              return;
            }
          }
        }
      } catch (fallbackErr) {
        logger.error(`Stream fallback failed for guild ${this.guildId}:`, fallbackErr);
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
