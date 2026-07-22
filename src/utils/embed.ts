import { EmbedBuilder } from "discord.js";
import { config } from "../config.js";

export class MusicEmbedBuilder {
  /**
   * Create a base embed with theme color and default footer
   */
  public static base(): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(config.embedColor as any)
      .setTimestamp()
      .setFooter({ text: "elmusic | leon x music system" });
  }

  /**
   * Success template
   */
  public static success(title: string, description: string): EmbedBuilder {
    return this.base()
      .setTitle(`✅ ${title}`)
      .setDescription(description)
      .setColor(0x2ecc71); // Green
  }

  /**
   * Error template
   */
  public static error(description: string): EmbedBuilder {
    return this.base()
      .setTitle("❌ Error")
      .setDescription(description)
      .setColor(0xe74c3c); // Red
  }

  /**
   * Now Playing / Track Start template (resembles Jockie Music details layout)
   */
  public static nowPlaying(track: { title: string; uri?: string; author: string; length: number }, requester: string): EmbedBuilder {
    const duration = this.formatDuration(track.length);
    return this.base()
      .setTitle("🎵 Now Playing")
      .setDescription(`[${track.title}](${track.uri || "#"})`)
      .addFields(
        { name: "Author", value: track.author, inline: true },
        { name: "Duration", value: duration, inline: true },
        { name: "Requested By", value: requester, inline: true }
      )
      .setThumbnail(`https://img.youtube.com/vi/${this.getYouTubeId(track.uri || "")}/hqdefault.jpg`);
  }

  /**
   * Helper to format millisecond duration into HH:MM:SS
   */
  public static formatDuration(ms: number): string {
    if (ms === 0) return "Live Stream";
    const totalSecs = Math.floor(ms / 1000);
    const secs = totalSecs % 60;
    const totalMins = Math.floor(totalSecs / 60);
    const mins = totalMins % 60;
    const hrs = Math.floor(totalMins / 60);

    const pad = (n: number) => n.toString().padStart(2, "0");
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }

  /**
   * Helper to extract YouTube ID from url for thumbnail
   */
  private static getYouTubeId(url: string): string {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : "";
  }
}
