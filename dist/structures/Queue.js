import { Routes } from "discord.js";
import { MusicEmbedBuilder } from "../utils/embed.js";
import { logger } from "../utils/logger.js";
export class Queue {
    client;
    player;
    guildId;
    textChannel;
    tracks = [];
    current = null;
    loop = "none";
    twentyFourSeven = false;
    autoplay = false;
    lyricsInterval = null;
    constructor(client, player, guildId, textChannel) {
        this.client = client;
        this.player = player;
        this.guildId = guildId;
        this.textChannel = textChannel;
        // Listen to Shoukaku Player Events
        this.player.on("start", () => this.onTrackStart());
        this.player.on("end", (reason) => this.onTrackEnd(reason));
        this.player.on("exception", (error) => this.onPlayerError(error));
        // Only destroy queue on closed event if NOT in 24/7 mode
        this.player.on("closed", () => {
            logger.warn(`Player connection closed in guild ${this.guildId}.`);
            if (!this.twentyFourSeven) {
                this.destroy();
            }
        });
    }
    addTrack(track, requester) {
        const trackWithRequester = { ...track, requester };
        this.tracks.push(trackWithRequester);
        if (!this.current) {
            this.playNext();
        }
    }
    async playNext() {
        if (this.lyricsInterval) {
            clearInterval(this.lyricsInterval);
            this.lyricsInterval = null;
        }
        if (this.tracks.length === 0) {
            this.current = null;
            this.updateVoiceChannelStatus("");
            this.textChannel.send(MusicEmbedBuilder.success("Queue Finished", "No more tracks to play. Use `/leave` to disconnect me from the voice channel.")).catch(() => { });
            return;
        }
        this.current = this.tracks.shift();
        try {
            const encodedTrack = this.current.encoded || this.current.track;
            await this.player.playTrack({ track: { encoded: encodedTrack } });
        }
        catch (error) {
            logger.error(`Error playing track in guild ${this.guildId}:`, error);
            this.textChannel.send(MusicEmbedBuilder.error("Could not play the next track.")).catch(() => { });
            this.playNext();
        }
    }
    async skip() {
        try {
            await this.player.stopTrack();
        }
        catch (error) {
            logger.error(`Error skipping track in guild ${this.guildId}:`, error);
        }
    }
    async stop() {
        this.tracks = [];
        try {
            await this.player.stopTrack();
        }
        catch (error) {
            logger.error(`Error stopping track in guild ${this.guildId}:`, error);
        }
    }
    async setVolume(level) {
        // Shoukaku v4 setGlobalVolume changes player volume level (0 to 1000)
        await this.player.setGlobalVolume(level);
    }
    playedHistory = new Set();
    cleanTitle(title) {
        return (title || "")
            .toLowerCase()
            .replace(/\(official\s*(music\s*)?video\)/gi, "")
            .replace(/\(audio\)/gi, "")
            .replace(/\(lyric\s*video\)/gi, "")
            .replace(/\[.*?\]/g, "")
            .replace(/\(.*?\)/g, "")
            .trim();
    }
    onTrackStart() {
        if (!this.current)
            return;
        const trackInfo = this.current.info;
        const requester = this.current.requester;
        // Track played history to avoid looping in autoplay
        if (trackInfo.identifier)
            this.playedHistory.add(trackInfo.identifier);
        const cleaned = this.cleanTitle(trackInfo.title);
        if (cleaned)
            this.playedHistory.add(cleaned);
        if (this.playedHistory.size > 100) {
            const firstKey = this.playedHistory.values().next().value;
            if (firstKey)
                this.playedHistory.delete(firstKey);
        }
        this.updateVoiceChannelStatus(`${trackInfo.title} - ${trackInfo.author}`.substring(0, 50));
        this.textChannel.send(MusicEmbedBuilder.nowPlaying(trackInfo, requester, this.player.paused, this.autoplay)).catch(() => { });
    }
    async onTrackEnd(reason) {
        logger.info(`Track ended in guild ${this.guildId}. Reason: ${reason.reason}`);
        // Handle loop status
        if (this.current) {
            if (this.loop === "track") {
                this.tracks.unshift(this.current);
            }
            else if (this.loop === "queue") {
                this.tracks.push(this.current);
            }
        }
        // Autoplay logic if queue is empty (YouTube/Spotify style continuous autoplay)
        if (this.tracks.length === 0 && this.autoplay && this.current && this.loop === "none") {
            try {
                const lastTitle = this.current.info.title || "";
                const lastAuthor = this.current.info.author || "";
                const cleanedLastTitle = this.cleanTitle(lastTitle);
                const node = this.client.shoukaku.getIdealNode();
                if (node) {
                    // Search strategies for related/next songs
                    const searchQueries = [
                        `ytmsearch:${lastAuthor} top tracks`,
                        `ytmsearch:${lastAuthor} songs`,
                        `ytmsearch:${lastAuthor} radio`,
                        `scsearch:${lastAuthor}`
                    ];
                    let nextTrack = null;
                    for (const query of searchQueries) {
                        const res = await node.rest.resolve(query);
                        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                            // Find a candidate that is NOT the same song and HAS NOT been played recently
                            const candidate = res.data.find((t) => {
                                if (!t.info)
                                    return false;
                                const id = t.info.identifier;
                                const title = t.info.title || "";
                                const clean = this.cleanTitle(title);
                                // Skip if already in history
                                if (id && this.playedHistory.has(id))
                                    return false;
                                if (clean && this.playedHistory.has(clean))
                                    return false;
                                // Skip if title is practically identical to last title
                                if (clean && cleanedLastTitle && (clean.includes(cleanedLastTitle) || cleanedLastTitle.includes(clean))) {
                                    return false;
                                }
                                return true;
                            });
                            if (candidate) {
                                nextTrack = candidate;
                                break;
                            }
                        }
                    }
                    if (nextTrack) {
                        this.tracks.push({ ...nextTrack, requester: "Autoplay" });
                        this.textChannel.send(MusicEmbedBuilder.success("Autoplay Next", `Playing next related song: **[${nextTrack.info.title}](${nextTrack.info.uri || "#"})** by **${nextTrack.info.author}**`)).catch(() => { });
                    }
                }
            }
            catch (err) {
                logger.error(`Autoplay resolution failed in guild ${this.guildId}:`, err);
            }
        }
        this.playNext();
    }
    async onPlayerError(error) {
        logger.error(`Lavalink Player error in guild ${this.guildId}:`, error);
        // Snapshot current to avoid null-ref if track ends while fallback is async
        const current = this.current;
        // Automatic fallback for YouTube/SoundCloud stream errors
        if (current && !current._isFallback) {
            current._isFallback = true;
            if (this.current)
                this.current._isFallback = true;
            try {
                let title = current.info?.title || "";
                let author = current.info?.author || "";
                if (author === "Unknown Artist")
                    author = "";
                const searchQuery = `${author} ${title} audio`.trim();
                const node = this.client.shoukaku.getIdealNode();
                if (node && searchQuery.length > 0) {
                    logger.info(`Attempting stream fallback for "${searchQuery}"...`);
                    let res = await node.rest.resolve(`ytmsearch:${searchQuery}`);
                    if (!res || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
                        res = await node.rest.resolve(`scsearch:${searchQuery}`);
                    }
                    if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                        const fallbackTrack = { ...res.data[0], requester: current.requester, _isFallback: true };
                        this.current = fallbackTrack;
                        const encodedTrack = fallbackTrack.encoded || fallbackTrack.track;
                        await this.player.playTrack({ track: { encoded: encodedTrack } });
                        return;
                    }
                }
            }
            catch (fallbackErr) {
                logger.error(`Stream fallback failed for guild ${this.guildId}:`, fallbackErr);
            }
        }
        this.textChannel.send(MusicEmbedBuilder.error("Could not stream this track from YouTube or SoundCloud.")).catch(() => { });
        this.playNext();
    }
    async updateVoiceChannelStatus(statusText) {
        try {
            const guild = this.client.guilds.cache.get(this.guildId);
            const voiceChannelId = guild?.members.me?.voice.channelId;
            if (voiceChannelId) {
                await this.client.rest.put(Routes.channelVoiceStatus(voiceChannelId), {
                    body: { status: statusText },
                });
            }
        }
        catch (err) {
            // Silently catch if bot lacks permission or status update fails
        }
    }
    destroy() {
        if (this.lyricsInterval) {
            clearInterval(this.lyricsInterval);
            this.lyricsInterval = null;
        }
        this.updateVoiceChannelStatus("");
        logger.info(`Destroying queue and leaving channel for guild ${this.guildId}`);
        this.client.shoukaku.leaveVoiceChannel(this.guildId).catch(() => { });
        this.client.queues.delete(this.guildId);
    }
}
