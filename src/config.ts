import dotenv from "dotenv";
dotenv.config();

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Environment variable "${name}" is required but not defined.`);
  }
  return val;
}

export const config = {
  token: requiredEnv("DISCORD_TOKEN"),
  clientId: requiredEnv("CLIENT_ID"),
  guildId: process.env.GUILD_ID || null, // Optional guild for dev commands registration
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || null,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
  },
  youtubeCookies: process.env.YOUTUBE_COOKIES || null,
  embedColor: process.env.EMBED_COLOR || "#5865F2",
  prefix: process.env.PREFIX || "!",
};
