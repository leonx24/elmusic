import { ChatInputCommandInteraction, ApplicationCommandOptionType } from "discord.js";
import { Command } from "../../structures/Command.js";
import { BotClient } from "../../structures/BotClient.js";
import { MusicEmbedBuilder } from "../../utils/embed.js";
import { buildV2Container } from "../../utils/components-v2.js";
import { logger } from "../../utils/logger.js";

interface LyricLine {
  time: number; // in milliseconds
  text: string;
}

export default class LyricsCommand extends Command {
  constructor() {
    super({
      name: "lyrics",
      description: "Search for the lyrics of a song (runs live lyrics if playing)",
      options: [
        {
          name: "query",
          description: "The name of the song to search lyrics for",
          type: ApplicationCommandOptionType.String,
          required: false,
        },
      ],
    });
  }

  async run(client: BotClient, interaction: ChatInputCommandInteraction): Promise<unknown> {
    let query = interaction.options.getString("query");
    const queue = client.queues.get(interaction.guildId!);
    
    // Defer the reply since fetching lyrics from an external API can take a few seconds
    await interaction.deferReply();

    // Determine if we should run in live lyrics mode (only if they search currently playing song)
    const isLiveMode = !query && queue && queue.current;

    if (!query) {
      if (!queue || !queue.current) {
        return interaction.editReply(
          MusicEmbedBuilder.error(
            "No music is playing right now. Please provide a song title using `/lyrics query: [song]`"
          )
        );
      }
      query = `${queue.current.info.author} - ${queue.current.info.title}`;
    }

    // Clean the song title to increase lyrics lookup success rate
    const cleanQuery = this.cleanTitle(query!);
    logger.info(`Searching lyrics for query: "${cleanQuery}" (original: "${query}")`);

    try {
      const response = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(cleanQuery)}`,
        {
          headers: {
            "User-Agent": "ElMusic Discord Bot (https://github.com/leonx24/elmusic)",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`LRCLIB returned status code ${response.status}`);
      }

      const data = (await response.json()) as any[];

      if (!Array.isArray(data) || data.length === 0) {
        return this.sendNoLyricsFound(interaction, cleanQuery);
      }

      // Check for first track that has either syncedLyrics or plainLyrics
      let matchedTrack = null;
      for (const track of data) {
        if ((track.syncedLyrics && track.syncedLyrics.trim().length > 0) || 
            (track.plainLyrics && track.plainLyrics.trim().length > 0)) {
          matchedTrack = track;
          break;
        }
      }

      if (!matchedTrack) {
        return this.sendNoLyricsFound(interaction, cleanQuery);
      }

      // If the matched lyrics contain Japanese characters (Kanji/Kana), perform a secondary Romaji lookup
      const primaryLyrics = matchedTrack.plainLyrics || matchedTrack.syncedLyrics || "";
      if (this.hasJapanese(primaryLyrics)) {
        logger.info(`Japanese characters detected in primary lyrics. Attempting secondary Romaji search...`);
        try {
          const romajiResponse = await fetch(
            `https://lrclib.net/api/search?q=${encodeURIComponent(cleanQuery + " romaji")}`,
            {
              headers: {
                "User-Agent": "ElMusic Discord Bot (https://github.com/leonx24/elmusic)",
              },
            }
          );
          if (romajiResponse.ok) {
            const romajiData = (await romajiResponse.json()) as any[];
            if (Array.isArray(romajiData) && romajiData.length > 0) {
              for (const rTrack of romajiData) {
                if ((rTrack.syncedLyrics && rTrack.syncedLyrics.trim().length > 0) ||
                    (rTrack.plainLyrics && rTrack.plainLyrics.trim().length > 0)) {
                  logger.info(`Successfully retrieved Romaji lyrics for: ${cleanQuery}`);
                  matchedTrack = rTrack;
                  break;
                }
              }
            }
          }
        } catch (rErr) {
          logger.warn("Secondary Romaji lyrics lookup failed, falling back to primary lyrics:", rErr);
        }
      }

      const trackName = matchedTrack.trackName || queue?.current?.info?.title || cleanQuery;
      const artistName = matchedTrack.artistName || queue?.current?.info?.author || "";

      // If live mode is possible and we have synced lyrics, run live scrolling lyrics
      if (isLiveMode && matchedTrack.syncedLyrics && matchedTrack.syncedLyrics.trim().length > 0) {
        logger.info(`Entering Live Lyrics mode for: ${trackName} in guild ${interaction.guildId}`);
        const parsedLyrics = this.parseLRC(matchedTrack.syncedLyrics);
        
        if (parsedLyrics.length === 0) {
          // Fallback to plain lyrics if parsing failed
          return this.sendPlainLyrics(interaction, trackName, artistName, matchedTrack.plainLyrics);
        }

        const currentTrackId = queue.current.info.identifier;

        // Clear any pre-existing lyrics intervals for this guild
        if (queue.lyricsInterval) {
          clearInterval(queue.lyricsInterval);
        }

        // Send initial frame
        const initialEmbed = this.buildLiveLyricsEmbed(parsedLyrics, queue.player.position, trackName, artistName, queue.current.info.length);
        await interaction.editReply(initialEmbed);

        // Set interval to update active line every 3.5 seconds
        const interval = setInterval(async () => {
          // Check if queue has changed or stopped
          const activeQueue = client.queues.get(interaction.guildId!);
          if (!activeQueue || !activeQueue.current || activeQueue.current.info.identifier !== currentTrackId) {
            clearInterval(interval);
            if (activeQueue && activeQueue.lyricsInterval === interval) {
              activeQueue.lyricsInterval = null;
            }
            return;
          }

          const currentPos = activeQueue.player.position;
          const liveEmbed = this.buildLiveLyricsEmbed(parsedLyrics, currentPos, trackName, artistName, activeQueue.current.info.length);
          
          await interaction.editReply(liveEmbed).catch(() => {
            // Clear interval if interaction was deleted or closed
            clearInterval(interval);
            if (activeQueue.lyricsInterval === interval) {
              activeQueue.lyricsInterval = null;
            }
          });
        }, 2000);

        queue.lyricsInterval = interval;
        return;
      }

      // Default: show static plain lyrics
      return this.sendPlainLyrics(interaction, trackName, artistName, matchedTrack.plainLyrics || matchedTrack.syncedLyrics.replace(/\[.*?\]/g, ""));
    } catch (error) {
      logger.error("Error fetching lyrics:", error);
      return interaction.editReply(
        MusicEmbedBuilder.error("An error occurred while fetching the lyrics. Please try again later.")
      );
    }
  }

  /**
   * Helper to clean YouTube/Music title tags to search for cleaner track names
   */
  private cleanTitle(title: string): string {
    return title
      .replace(/\s*-\s*topic/gi, "") // Remove YouTube's auto-generated " - Topic" suffix
      .replace(/\s+vevo/gi, "")      // Remove " VEVO" music channel suffix
      .replace(/\(.*?\)/g, "") // Remove anything inside parentheses (e.g. Official Video, Cover, Lirik)
      .replace(/\[.*?\]/g, "") // Remove anything inside brackets (e.g. Live)
      .replace(/official\s+(video|audio|lyric|lyrics|music)/gi, "")
      .replace(/video\s+clip/gi, "")
      .replace(/feat\..*/gi, "")
      .replace(/ft\..*/gi, "")
      .replace(/lirik\s+lagu/gi, "")
      .trim();
  }

  /**
   * Parse syncedLyrics (LRC string) into an array of LyricLines
   */
  private parseLRC(lrc: string): LyricLine[] {
    const lines = lrc.split("\n");
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;

    for (const line of lines) {
      const text = line.replace(timeRegex, "").trim();
      timeRegex.lastIndex = 0;
      const match = timeRegex.exec(line);
      
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const hundredths = match[3] ? parseInt(match[3], 10) : 0;
        
        // Convert to milliseconds
        const time = (minutes * 60 + seconds) * 1000 + (match[3] && match[3].length === 2 ? hundredths * 10 : hundredths);
        
        // Exclude empty lyric formatting items
        if (text.length > 0 || result.length > 0) {
          result.push({ time, text });
        }
      }
    }
    
    return result.sort((a, b) => a.time - b.time);
  }

  /**
   * Build the scrolling lyrics embed view based on current playback milliseconds
   */
  private buildLiveLyricsEmbed(parsedLyrics: LyricLine[], position: number, trackName: string, artistName: string, totalLength: number): any {
    // Add latency compensation offset (800ms) to sync better with network lag and audio buffers
    const adjustedPos = position + 800;

    // Find the currently active line index
    let activeIndex = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (adjustedPos >= parsedLyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    const displayLines: string[] = [];
    
    // Set viewport: show 3 lines before and 4 lines after current active line
    const start = Math.max(0, activeIndex - 3);
    const end = Math.min(parsedLyrics.length - 1, activeIndex + 4);

    for (let i = start; i <= end; i++) {
      const lineText = parsedLyrics[i].text || "♪";
      if (i === activeIndex) {
        displayLines.push(`▶️ **${lineText}**`);
      } else {
        displayLines.push(`*${lineText}*`);
      }
    }

    const elapsed = MusicEmbedBuilder.formatDuration(position);
    const duration = MusicEmbedBuilder.formatDuration(totalLength);

    return buildV2Container({
      title: `🎤 Live Lyrics: ${trackName}`,
      description: `👤 **Artist:** ${artistName}\n\n${displayLines.join("\n\n")}`,
      accentColor: 0x5865f2,
      footer: `Playing: ${trackName} | [${elapsed} / ${duration}]`,
    });
  }

  /**
   * Send plain static lyrics embed
   */
  private sendPlainLyrics(interaction: ChatInputCommandInteraction, trackName: string, artistName: string, lyrics: string) {
    let lyricsText = lyrics;
    if (lyricsText.length > 3500) {
      lyricsText = lyricsText.substring(0, 3500) + "\n\n*...lirik terpotong karena terlalu panjang*";
    }

    return interaction.editReply(
      buildV2Container({
        title: `🎤 Lyrics: ${trackName}`,
        description: `👤 **Artist:** ${artistName}\n\n${lyricsText}`,
        accentColor: 0x5865f2,
        footer: "Lyrics powered by LRCLIB (Plain Mode)",
      })
    );
  }

  /**
   * Send standard error embed for no lyrics found
   */
  private sendNoLyricsFound(interaction: ChatInputCommandInteraction, query: string) {
    const tipsContent =
      `Could not find any lyrics for "**${query}**".\n\n` +
      `*Tips: Jika kamu mengambil judul dari video YouTube, terkadang judulnya mengandung nama uploader atau tag video lainnya. Cobalah mengetik pencarian bersih secara manual dengan format:*\n` +
      `\`/lyrics query: [Nama Artis] [Judul Lagu]\``;

    return interaction.editReply(
      buildV2Container({
        title: "❌ No Lyrics Found",
        description: tipsContent,
        accentColor: 0xe74c3c,
        footer: "elmusic | leon x music system",
      })
    );
  }

  /**
   * Helper to check if a text string contains Japanese (Kanji/Hiragana/Katakana) characters
   */
  private hasJapanese(text: string): boolean {
    return /[\u3040-\u30ff\u4e00-\u9faf]/g.test(text);
  }
}
