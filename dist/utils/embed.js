import { buildV2Container } from "./components-v2.js";
export class MusicComponentBuilder {
    static FLAGS = 32768; // MessageFlags.IsComponentsV2 (1 << 15)
    /**
     * Helper to build container directly
     */
    static container(children, accentColor) {
        return {
            flags: this.FLAGS,
            components: [
                {
                    type: 17, // Container
                    accent_color: accentColor ?? null,
                    components: children,
                },
            ],
        };
    }
    /**
     * TextDisplay component (Type 10)
     */
    static text(content) {
        return {
            type: 10,
            content,
        };
    }
    /**
     * Separator component (Type 14)
     */
    static separator() {
        return {
            type: 14,
            divider: true,
            spacing: 1,
        };
    }
    /**
     * Success response template
     */
    static success(title, description) {
        return buildV2Container({
            title: `✅ ${title}`,
            description,
            accentColor: 0x2ecc71, // Green
            footer: "elmusic | leon x music system",
        });
    }
    /**
     * Error response template
     */
    static error(description) {
        return buildV2Container({
            title: "❌ Error",
            description,
            accentColor: 0xe74c3c, // Red
            footer: "elmusic | leon x music system",
        });
    }
    /**
     * Now Playing / Track Start template
     */
    static nowPlaying(track, requester) {
        const duration = this.formatDuration(track.length);
        const thumbnailId = this.getYouTubeId(track.uri || "");
        const thumbnailUrl = thumbnailId ? `https://img.youtube.com/vi/${thumbnailId}/hqdefault.jpg` : undefined;
        return buildV2Container({
            title: "🎵 Now Playing",
            description: `[**${track.title}**](${track.uri || "#"})`,
            thumbnailUrl,
            accentColor: 0x5865f2,
            sections: [
                {
                    title: "📌 Song Information",
                    content: `👤 **Author:** ${track.author}\n` +
                        `⏱️ **Duration:** \`${duration}\` | 👤 **Requested By:** ${requester}`,
                },
            ],
            footer: "elmusic | leon x music system",
        });
    }
    /**
     * Helper to format millisecond duration into HH:MM:SS
     */
    static formatDuration(ms) {
        if (ms === 0)
            return "Live Stream";
        const totalSecs = Math.floor(ms / 1000);
        const secs = totalSecs % 60;
        const totalMins = Math.floor(totalSecs / 60);
        const mins = totalMins % 60;
        const hrs = Math.floor(totalMins / 60);
        const pad = (n) => n.toString().padStart(2, "0");
        return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
    }
    /**
     * Helper to extract YouTube ID from url for thumbnail
     */
    static getYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return match && match[2].length === 11 ? match[2] : "";
    }
}
// Export backward compatible alias
export const MusicEmbedBuilder = MusicComponentBuilder;
