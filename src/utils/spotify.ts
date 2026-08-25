import { logger } from "./logger.js";

export interface SpotifyTrack {
  title: string;
  author: string;
  query: string;
}

export class SpotifyResolver {
  public static isSpotifyUrl(url: string): boolean {
    return /^https?:\/\/(?:open|play)\.spotify\.com\/(?:intl-[a-zA-Z]+\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/i.test(url);
  }

  public static async resolve(url: string): Promise<{ type: "track" | "playlist" | "album"; name: string; tracks: SpotifyTrack[] } | null> {
    const match = url.match(/^https?:\/\/(?:open|play)\.spotify\.com\/(?:intl-[a-zA-Z]+\/)?(track|album|playlist)\/([a-zA-Z0-9]+)/i);
    if (!match) return null;

    const type = match[1] as "track" | "playlist" | "album";
    const id = match[2];

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
        const author = data.author_name && data.author_name !== "Unknown Artist" ? data.author_name : "";

        return {
          type: "track",
          name: title,
          tracks: [
            {
              title,
              author: author || "Spotify",
              query: author ? `${author} - ${title}` : title,
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
                              html.match(/<script id="__NEXT_DATA__" type="application\/json">\s*({.*?})\s*<\/script>/s) ||
                              html.match(/<script id="initial-state" type="application\/json">\s*({.*?})\s*<\/script>/s);

        if (resourceMatch && resourceMatch[1]) {
          try {
            const json = JSON.parse(resourceMatch[1]);
            const entity = json.props?.pageProps?.state?.data?.entity || json.entity || json.data?.entity || json;
            
            const collectionName = entity.name || entity.title || (type === "playlist" ? "Spotify Playlist" : "Spotify Album");
            const trackItems = entity.tracks?.items || entity.trackList || entity.tracks || [];

            const tracks: SpotifyTrack[] = [];
            for (const item of trackItems) {
              const trackObj = item.track || item.data || item;
              const title = trackObj.name || trackObj.title;

              // Extract artist names from various Spotify embed structures
              let artists = "";
              if (Array.isArray(trackObj.artists)) {
                artists = trackObj.artists
                  .map((a: any) => (typeof a === "string" ? a : a.name || ""))
                  .filter((n: string) => n.length > 0)
                  .join(", ");
              } else if (typeof trackObj.artists === "string") {
                artists = trackObj.artists;
              } else if (typeof trackObj.artist === "string") {
                artists = trackObj.artist;
              } else if (typeof trackObj.subtitle === "string") {
                artists = trackObj.subtitle;
              } else if (typeof trackObj.subTitle === "string") {
                artists = trackObj.subTitle;
              }

              if (artists === "Unknown Artist") artists = "";

              if (title) {
                tracks.push({
                  title,
                  author: artists || "Spotify",
                  query: artists ? `${artists} - ${title}` : title,
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
          } catch (jsonErr) {
            logger.warn(`Failed to parse Spotify embed JSON:`, jsonErr);
          }
        }

        // Fallback: oEmbed for playlist/album title
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const ores = await fetch(oembedUrl);
        if (ores.ok) {
          const odata = (await ores.json()) as any;
          const name = odata.title || `Spotify ${type}`;
          const author = odata.author_name || "Spotify";
          return {
            type,
            name,
            tracks: [
              {
                title: name,
                author,
                query: author && author !== "Spotify" ? `${author} ${name}` : name,
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
