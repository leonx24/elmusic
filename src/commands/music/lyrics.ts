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
  private lyricsIntervals = new Map<string, NodeJS.Timeout>();

  constructor() {
    super({
      name: "lyrics",
      description: "Search for the lyrics of a song (runs live lyrics if playing)",
      aliases: ["l"],
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
    const queue = client.distube.getQueue(interaction.guildId!);
    
    // Defer the reply since fetching lyrics from an external API can take a few seconds
    await interaction.deferReply();

    // Determine if we should run in live lyrics mode (only if they search currently playing song)
    const isLiveMode = !query && queue && queue.songs && queue.songs.length > 0;

    if (!query) {
      if (!queue || !queue.songs || queue.songs.length === 0) {
        return interaction.editReply(
          MusicEmbedBuilder.error(
            "No music is playing right now. Please provide a song title using `/lyrics query: [song]`"
          )
        );
      }
      query = `${queue.songs[0].uploader?.name || ""} - ${queue.songs[0].name}`;
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

      if (!data || data.length === 0) {
        return interaction.editReply(
          MusicEmbedBuilder.warning(
            "Lyrics Not Found",
            `Could not find lyrics for **${query}**.\nTry searching with artist and title explicitly (e.g. \`/lyrics query: Adele - Easy On Me\`).`
          )
        );
      }

      // Pick the best match (prefer one with syncedLyrics or plainLyrics)
      let matchedTrack = data.find(t => t.syncedLyrics && t.syncedLyrics.trim().length > 0) ||
                         data.find(t => t.plainLyrics && t.plainLyrics.trim().length > 0) ||
                         data[0];

      if (!matchedTrack || (!matchedTrack.plainLyrics && !matchedTrack.syncedLyrics)) {
        return interaction.editReply(
          MusicEmbedBuilder.warning(
            "Lyrics Not Found",
            `No lyric text available for **${query}**.`
          )
        );
      }

      // If Japanese/East Asian song, check if a Romaji version is available in search results
      if (this.containsJapaneseCharacters(cleanQuery) || this.containsJapaneseCharacters(matchedTrack.trackName || "")) {
        try {
          const romajiQuery = `${cleanQuery} romaji`;
          const romajiRes = await fetch(
            `https://lrclib.net/api/search?q=${encodeURIComponent(romajiQuery)}`,
            {
              headers: { "User-Agent": "ElMusic Discord Bot" },
            }
          );
          if (romajiRes.ok) {
            const romajiData = (await romajiRes.json()) as any[];
            if (romajiData && romajiData.length > 0) {
              for (const rTrack of romajiData) {
                if (rTrack.syncedLyrics || rTrack.plainLyrics) {
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

      const currentSong = queue?.songs?.[0];
      const trackName = matchedTrack.trackName || currentSong?.name || cleanQuery;
      const artistName = matchedTrack.artistName || currentSong?.uploader?.name || "";

      // If live mode is possible and we have synced lyrics, run live scrolling lyrics
      if (isLiveMode && matchedTrack.syncedLyrics && matchedTrack.syncedLyrics.trim().length > 0 && currentSong) {
        logger.info(`Entering Live Lyrics mode for: ${trackName} in guild ${interaction.guildId}`);
        const parsedLyrics = this.parseLRC(matchedTrack.syncedLyrics);
        
        if (parsedLyrics.length === 0) {
          // Fallback to plain lyrics if parsing failed
          return this.sendPlainLyrics(interaction, trackName, artistName, matchedTrack.plainLyrics);
        }

        const currentTrackId = currentSong.id;
        const guildId = interaction.guildId!;

        // Clear any pre-existing lyrics intervals for this guild
        const existingInterval = this.lyricsIntervals.get(guildId);
        if (existingInterval) {
          clearInterval(existingInterval);
          this.lyricsIntervals.delete(guildId);
        }

        // Send initial frame
        const currentPos = queue.currentTime * 1000;
        const totalLength = currentSong.duration * 1000;
        const initialEmbed = this.buildLiveLyricsEmbed(parsedLyrics, currentPos, trackName, artistName, totalLength);
        await interaction.editReply(initialEmbed);

        // Set interval to update active line every 3.5 seconds
        const interval = setInterval(async () => {
          const activeQueue = client.distube.getQueue(guildId);
          const activeSong = activeQueue?.songs?.[0];
          if (!activeQueue || !activeSong || activeSong.id !== currentTrackId) {
            clearInterval(interval);
            this.lyricsIntervals.delete(guildId);
            return;
          }

          const pos = activeQueue.currentTime * 1000;
          const liveEmbed = this.buildLiveLyricsEmbed(parsedLyrics, pos, trackName, artistName, activeSong.duration * 1000);
          
          await interaction.editReply(liveEmbed).catch(() => {
            clearInterval(interval);
            this.lyricsIntervals.delete(guildId);
          });
        }, 3500);

        this.lyricsIntervals.set(guildId, interval);
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

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer|hd|4k)?|mv|lyrics|feat\.?|ft\.?|full\s*song|remix|slowed|reverb)[\)\]]/gi, "")
      .replace(/ft\..*$/i, "")
      .replace(/feat\..*$/i, "")
      .replace(/[^\w\s\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private containsJapaneseCharacters(str: string): boolean {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(str);
  }

  private parseLRC(lrcText: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const rawLines = lrcText.split("\n");
    const timeTagRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const rawLine of rawLines) {
      const tags = [...rawLine.matchAll(timeTagRegex)];
      if (tags.length === 0) continue;

      const text = rawLine.replace(timeTagRegex, "").trim();
      if (!text) continue;

      for (const tag of tags) {
        const minutes = parseInt(tag[1], 10);
        const seconds = parseInt(tag[2], 10);
        let ms = 0;
        if (tag[3]) {
          ms = tag[3].length === 2 ? parseInt(tag[3], 10) * 10 : parseInt(tag[3], 10);
        }

        const time = minutes * 60 * 1000 + seconds * 1000 + ms;
        lines.push({ time, text });
      }
    }

    return lines.sort((a, b) => a.time - b.time);
  }

  private buildLiveLyricsEmbed(
    lyrics: LyricLine[],
    currentPositionMs: number,
    trackName: string,
    artistName: string,
    durationMs: number
  ) {
    let activeIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentPositionMs) {
        activeIndex = i;
      } else {
        break;
      }
    }

    const start = Math.max(0, activeIndex - 2);
    const end = Math.min(lyrics.length, activeIndex + 4);
    const visibleLines = lyrics.slice(start, end);

    let displayContent = "";
    if (visibleLines.length === 0) {
      displayContent = "*(Waiting for lyrics...)*";
    } else {
      displayContent = visibleLines
        .map((line, idx) => {
          const actualIndex = start + idx;
          if (actualIndex === activeIndex) {
            return `▶ **${line.text}**`;
          }
          return `   *${line.text}*`;
        })
        .join("\n");
    }

    const progressStr = `${MusicEmbedBuilder.formatDuration(currentPositionMs)} / ${MusicEmbedBuilder.formatDuration(durationMs)}`;

    return buildV2Container({
      title: `🎤 Lyrics — ${trackName}`,
      description: artistName ? `*by ${artistName}* • \`[LIVE SYNC]\`` : "`[LIVE SYNC]`",
      sections: [
        {
          title: "Current Lyrics",
          content: displayContent,
        },
      ],
      footer: `elmusic live lyrics | ${progressStr}`,
    });
  }

  private sendPlainLyrics(
    interaction: ChatInputCommandInteraction,
    trackName: string,
    artistName: string,
    lyricsText: string
  ) {
    const trimmed = lyricsText.length > 3900 ? lyricsText.substring(0, 3900) + "\n\n*(Lyrics truncated due to Discord length limit)*" : lyricsText;

    return interaction.editReply(
      buildV2Container({
        title: `🎤 Lyrics — ${trackName}`,
        description: artistName ? `*by ${artistName}*` : undefined,
        sections: [
          {
            title: "Lyrics",
            content: trimmed || "No lyrics available.",
          },
        ],
        footer: "elmusic | leon x music system",
      })
    );
  }
}
