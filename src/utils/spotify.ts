import { logger } from "./logger.js";

export interface SpotifyTrack {
  title: string;
  author: string;
  query: string;
}

export class SpotifyResolver {
  public static isSpotifyUrl(url: string): boolean {
    return /^https?:\/\/(open|play)\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/.test(url);
  }

  public static async resolve(url: string): Promise<{ type: "track" | "playlist" | "album"; name: string; tracks: SpotifyTrack[] } | null> {
    const match = url.match(/^https?:\/\/(open|play)\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!match) return null;

    const type = match[2] as "track" | "playlist" | "album";
    const id = match[3];

    try {
      if (type === "track") {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const res = await fetch(oembedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as any;

        const title = data.title || "Unknown Track";
        const author = data.author_name || "Unknown Artist";

        return {
          type: "track",
          name: title,
          tracks: [
            {
              title,
              author,
              query: `${author} - ${title}`,
            },
          ],
        };
      } else {
        // Album or Playlist via Embed Page HTML scraping
        const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
        const res = await fetch(embedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (!res.ok) return null;
        const html = await res.text();

        // Spotify embed HTML contains resource JSON script block with track details
        const resourceMatch = html.match(/<script id="resource" type="application\/json">\s*({.*?})\s*<\/script>/s) ||
                              html.match(/<script id="__NEXT_DATA__" type="application\/json">\s*({.*?})\s*<\/script>/s);

        if (resourceMatch && resourceMatch[1]) {
          const json = JSON.parse(resourceMatch[1]);
          const entity = json.props?.pageProps?.state?.data?.entity || json.entity || json;
          
          const collectionName = entity.name || (type === "playlist" ? "Spotify Playlist" : "Spotify Album");
          const trackItems = entity.tracks?.items || entity.trackList || [];

          const tracks: SpotifyTrack[] = [];
          for (const item of trackItems) {
            const trackObj = item.track || item;
            const title = trackObj.name || trackObj.title;
            const artists = trackObj.artists ? trackObj.artists.map((a: any) => a.name).join(", ") : (trackObj.artist || "Unknown Artist");

            if (title) {
              tracks.push({
                title,
                author: artists,
                query: `${artists} - ${title}`,
              });
            }
          }

          if (tracks.length > 0) {
            return {
              type,
              name: collectionName,
              tracks,
            };
          }
        }

        // Fallback: oEmbed for title
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const ores = await fetch(oembedUrl);
        if (ores.ok) {
          const odata = (await ores.json()) as any;
          const name = odata.title || `Spotify ${type}`;
          return {
            type,
            name,
            tracks: [
              {
                title: name,
                author: odata.author_name || "Spotify",
                query: `${odata.author_name || ""} ${name}`.trim(),
              },
            ],
          };
        }
      }
    } catch (error) {
      logger.error(`Error resolving Spotify URL (${url}):`, error);
    }

    return null;
  }
}
