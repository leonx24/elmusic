import dotenv from "dotenv";
dotenv.config();
function requiredEnv(name) {
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
            name: "Public-AjieDev",
            url: "lava-v4.ajieblogs.eu.org:443",
            auth: "https://dsc.gg/ajidevserver",
            secure: true,
        },
        {
            name: "Public-Muzykant",
            url: "lavalink_v4.muzykant.xyz:443",
            auth: "https://discord.gg/v6sdrD9kPh",
            secure: true,
        },
        {
            name: "Public-Jirayu",
            url: "lavalink.jirayu.net:13592",
            auth: "youshallnotpass",
            secure: false,
        },
        {
            name: "Local-Node",
            url: `${process.env.LAVALINK_HOST || "localhost"}:${process.env.LAVALINK_PORT || "2333"}`,
            auth: process.env.LAVALINK_PASS || "youshallnotpass",
            secure: process.env.LAVALINK_SECURE === "true",
        },
    ],
    embedColor: process.env.EMBED_COLOR || "#5865F2",
};
