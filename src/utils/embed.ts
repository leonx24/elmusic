import { config } from "../config.js";

export interface ComponentV2Message {
  flags: number;
  components: any[];
}

export class MusicComponentBuilder {
  public static readonly FLAGS = 32768; // MessageFlags.IsComponentsV2 (1 << 15)

  /**
   * Helper to wrap child components into a Container (Type 17) payload
   */
  public static container(children: any[], accentColor?: number): ComponentV2Message {
    return {
      flags: this.FLAGS,
      components: [
        {
          type: 17, // Container
          accent_color: accentColor,
          components: children,
        },
      ],
    };
  }

  /**
   * TextDisplay component (Type 10)
   */
  public static text(content: string): { type: number; content: string } {
    return {
      type: 10,
      content,
    };
  }

  /**
   * Separator component (Type 14)
   */
  public static separator(): { type: number } {
    return {
      type: 14,
    };
  }

  /**
   * Success response template
   */
  public static success(title: string, description: string): ComponentV2Message {
    return this.container(
      [
        this.text(`### ✅ ${title}\n${description}`),
        this.separator(),
        this.text(`*elmusic | leon x music system*`),
      ],
      0x2ecc71 // Green
    );
  }

  /**
   * Error response template
   */
  public static error(description: string): ComponentV2Message {
    return this.container(
      [
        this.text(`### ❌ Error\n${description}`),
        this.separator(),
        this.text(`*elmusic | leon x music system*`),
      ],
      0xe74c3c // Red
    );
  }

  /**
   * Now Playing / Track Start template
   */
  public static nowPlaying(
    track: { title: string; uri?: string; author: string; length: number },
    requester: string
  ): ComponentV2Message {
    const duration = this.formatDuration(track.length);
    const thumbnailId = this.getYouTubeId(track.uri || "");

    const contentText =
      `## 🎵 Now Playing\n` +
      `[**${track.title}**](${track.uri || "#"})\n\n` +
      `👤 **Author:** ${track.author}\n` +
      `⏱️ **Duration:** \`${duration}\` | 👤 **Requested By:** ${requester}`;

    const children: any[] = [this.text(contentText)];

    if (thumbnailId) {
      children.push(this.separator());
      children.push({
        type: 9, // Section
        components: [
          this.text(`*elmusic | leon x music system*`),
        ],
        accessory: {
          type: 11, // Thumbnail
          url: `https://img.youtube.com/vi/${thumbnailId}/hqdefault.jpg`,
        },
      });
    } else {
      children.push(this.separator());
      children.push(this.text(`*elmusic | leon x music system*`));
    }

    return this.container(children, 0x5865f2);
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

// Export backward compatible alias
export const MusicEmbedBuilder = MusicComponentBuilder;

