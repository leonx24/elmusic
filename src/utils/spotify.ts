import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import { config } from "../config.js";
import { logger } from "./logger.js";

let spotifyApi: SpotifyApi | null = null;

if (config.spotify.clientId && config.spotify.clientSecret) {
  try {
    spotifyApi = SpotifyApi.withClientCredentials(
      config.spotify.clientId,
      config.spotify.clientSecret
    );
    logger.info("Spotify API client initialized for Spotify-first search resolution.");
  } catch (err) {
    logger.warn("Failed to initialize Spotify API client:", err);
  }
}

/**
 * Resolves free-text queries to precise official metadata via Spotify API
 * to prevent YouTube search from returning unwanted covers/slowed versions.
 */
export async function resolveQuery(rawQuery: string): Promise<string> {
  // If the user pasted a direct URL (Spotify, YouTube, SoundCloud, etc.), return as-is
  if (/^https?:\/\//i.test(rawQuery)) {
    return rawQuery;
  }

  // If Spotify API is not configured, fallback to raw query
  if (!spotifyApi) {
    return rawQuery;
  }

  try {
    const result = await spotifyApi.search(rawQuery, ["track"], undefined, 1);
    const track = result.tracks?.items?.[0];
    if (track && track.name) {
      const artists = track.artists.map((a: any) => a.name).join(", ");
      const resolved = `${track.name} - ${artists} official audio`;
      logger.info(`Resolved "${rawQuery}" -> "${resolved}" via Spotify`);
      return resolved;
    }
  } catch (err) {
    logger.warn("Spotify query resolution failed, falling back to raw query:", err);
  }

  return rawQuery;
}
