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
  lavalink: [
    {
      name: "Local-Node",
      url: `${process.env.LAVALINK_HOST || "localhost"}:${process.env.LAVALINK_PORT || "2333"}`,
      auth: process.env.LAVALINK_PASS || "youshallnotpass",
      secure: process.env.LAVALINK_SECURE === "true",
    },
  ],
  embedColor: process.env.EMBED_COLOR || "#5865F2",
};
