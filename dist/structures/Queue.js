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
    idleTimeout = null;
    isSkipping = false;
    fallbackCandidatesMap = new Map();
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
    setFallbackTracks(track, candidates, requester) {
        if (!track?.info?.identifier || !Array.isArray(candidates) || candidates.length === 0)
            return;
        const candidatesWithRequester = candidates.map((c) => ({ ...c, requester, _isFallback: true }));
        this.fallbackCandidatesMap.set(track.info.identifier, candidatesWithRequester);
    }
    addTrack(track, requester) {
        this.clearIdleTimer();
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
            const finishedMsg = this.twentyFourSeven
                ? "No more tracks to play. 24/7 Standby mode is ON."
                : "No more tracks to play. I will automatically leave the voice channel in 2 minutes if no new songs are queued.";
            this.textChannel.send(MusicEmbedBuilder.success("Queue Finished", finishedMsg)).catch(() => { });
            if (!this.twentyFourSeven) {
                this.startIdleTimer();
            }
            return;
        }
        this.clearIdleTimer();
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
        this.isSkipping = true;
        try {
            await this.player.stopTrack();
        }
        catch (error) {
            this.isSkipping = false;
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
    playedAuthors = new Set();
    autoplayFailures = 0;
    lastAutoplayTime = 0;
    cleanTitle(title) {
        return (title || "")
            .toLowerCase()
            .replace(/\(official\s*(music\s*)?video\)/gi, "")
            .replace(/\(audio\)/gi, "")
            .replace(/\(lyric\s*video\)/gi, "")
            .replace(/\[.*?\]/g, "")
            .replace(/\(.*?\)/g, "")
            .replace(/\b\d+\s*hours?\s*(of)?\b/gi, "")
            .replace(/\bdeep\s*sleep\b/gi, "")
            .replace(/\bstudy\s*session\b/gi, "")
            .replace(/\|.*/g, "")
            .trim();
    }
    cleanAuthor(author) {
        return (author || "")
            .toLowerCase()
            .replace(/\s*-\s*topic$/i, "")
            .replace(/\s*vevo$/i, "")
            .replace(/official/i, "")
            .replace(/records/i, "")
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
        const cleanedAuthor = this.cleanAuthor(trackInfo.author);
        if (cleanedAuthor)
            this.playedAuthors.add(cleanedAuthor);
        if (this.playedAuthors.size > 50) {
            const firstAuthor = this.playedAuthors.values().next().value;
            if (firstAuthor)
                this.playedAuthors.delete(firstAuthor);
        }
        this.updateVoiceChannelStatus(`${trackInfo.title} - ${trackInfo.author}`.substring(0, 50));
        this.textChannel.send(MusicEmbedBuilder.nowPlaying(trackInfo, requester, this.player.paused, this.autoplay)).catch(() => { });
    }
    async onTrackEnd(reason) {
        const endReason = (typeof reason === "string" ? reason : reason?.reason || "").toLowerCase();
        logger.info(`Track ended in guild ${this.guildId}. Reason: ${endReason}`);
        const wasSkipping = this.isSkipping;
        this.isSkipping = false;
        // Only proceed to next track if track actually finished naturally or was explicitly skipped
        // (Prevents premature queue finish on track errors, stream fallback replacements, or /stop)
        if (endReason !== "finished" && !wasSkipping) {
            return;
        }
        // Handle loop status (skip bypasses track loop)
        if (this.current && !wasSkipping) {
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
                const now = Date.now();
                if (now - this.lastAutoplayTime < 10000) {
                    this.autoplayFailures++;
                }
                else {
                    this.autoplayFailures = 0;
                }
                this.lastAutoplayTime = now;
                if (this.autoplayFailures >= 3) {
                    logger.warn(`Autoplay halted due to rapid successive track ends in guild ${this.guildId}`);
                    this.autoplay = false;
                    this.autoplayFailures = 0;
                    this.textChannel.send(MusicEmbedBuilder.error("Autoplay paused because tracks ended too quickly. Use `/autoplay` to re-enable.")).catch(() => { });
                    this.playNext();
                    return;
                }
                const lastTitle = this.current.info.title || "";
                const lastAuthor = this.current.info.author || "";
                const cleanedLastTitle = this.cleanTitle(lastTitle);
                const cleanedLastAuthor = this.cleanAuthor(lastAuthor);
                const node = this.client.shoukaku.getIdealNode();
                if (node) {
                    // Search strategies for related songs (mix/radio to find similar songs by DIFFERENT artists)
                    const searchQueries = [
                        `ytmsearch:${cleanedLastTitle} mix`,
                        `ytmsearch:${cleanedLastTitle} radio`,
                        `ytmsearch:${cleanedLastAuthor} radio`,
                        `ytsearch:${cleanedLastTitle} audio`,
                        `ytmsearch:${cleanedLastTitle}`
                    ];
                    let nextTrack = null;
                    // First pass: Find a song by a DIFFERENT artist that hasn't been played recently
                    for (const query of searchQueries) {
                        const res = await node.rest.resolve(query);
                        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                            const candidate = res.data.find((t) => {
                                if (!t.info)
                                    return false;
                                const id = t.info.identifier;
                                const title = t.info.title || "";
                                const author = t.info.author || "";
                                const clean = this.cleanTitle(title);
                                const cleanAuthor = this.cleanAuthor(author);
                                // Skip if track or title already in history
                                if (id && this.playedHistory.has(id))
                                    return false;
                                if (clean && this.playedHistory.has(clean))
                                    return false;
                                // Skip if title is practically identical to last title
                                if (clean && cleanedLastTitle && (clean.includes(cleanedLastTitle) || cleanedLastTitle.includes(clean))) {
                                    return false;
                                }
                                // DIVERSE ARTIST CHECK: Skip if candidate is by the same author
                                if (cleanedLastAuthor && cleanAuthor && (cleanAuthor.includes(cleanedLastAuthor) || cleanedLastAuthor.includes(cleanAuthor))) {
                                    return false;
                                }
                                // Prefer artists not recently played
                                if (cleanAuthor && this.playedAuthors.has(cleanAuthor)) {
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
                    // Second pass fallback: If strict artist diversity didn't find a candidate, allow non-recent author but still exclude exact same author
                    if (!nextTrack) {
                        for (const query of searchQueries) {
                            const res = await node.rest.resolve(query);
                            if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                                const candidate = res.data.find((t) => {
                                    if (!t.info)
                                        return false;
                                    const id = t.info.identifier;
                                    const title = t.info.title || "";
                                    const author = t.info.author || "";
                                    const clean = this.cleanTitle(title);
                                    const cleanAuthor = this.cleanAuthor(author);
                                    if (id && this.playedHistory.has(id))
                                        return false;
                                    if (clean && this.playedHistory.has(clean))
                                        return false;
                                    if (cleanedLastAuthor && cleanAuthor && (cleanAuthor.includes(cleanedLastAuthor) || cleanedLastAuthor.includes(cleanAuthor))) {
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
        const current = this.current;
        if (!current) {
            this.playNext();
            return;
        }
        // 1. Check if we have pre-saved fallback search candidates for this track
        const trackId = current.info?.identifier || current.encoded;
        if (trackId && this.fallbackCandidatesMap.has(trackId)) {
            const candidates = this.fallbackCandidatesMap.get(trackId);
            if (candidates && candidates.length > 0) {
                const nextCandidate = candidates.shift();
                logger.warn(`Track failed to play: ${current.info?.title}. Retrying with next candidate: "${nextCandidate.info?.title}" in guild ${this.guildId}...`);
                this.textChannel.send(MusicEmbedBuilder.warning("Playback Retry", `⚠️ Track **${current.info?.title}** encountered an issue, trying alternative version: **${nextCandidate.info?.title}**...`)).catch(() => { });
                this.current = nextCandidate;
                const encodedTrack = nextCandidate.encoded || nextCandidate.track;
                try {
                    await this.player.playTrack({ track: { encoded: encodedTrack } });
                    return;
                }
                catch (retryErr) {
                    logger.error(`Failed to play candidate track:`, retryErr);
                }
            }
        }
        // 2. Automatic fallback search if not already a fallback
        if (!current._isFallback) {
            current._isFallback = true;
            try {
                let title = current.info?.title || "";
                let author = current.info?.author || "";
                if (author === "Unknown Artist" || author === "Spotify")
                    author = "";
                const cleanTitleText = this.cleanTitle(title);
                const searchQuery = `${author} ${cleanTitleText}`.trim() || title;
                const node = this.client.shoukaku.getIdealNode();
                if (node && searchQuery.length > 0) {
                    logger.info(`Attempting stream fallback search for "${searchQuery}"...`);
                    let res = await node.rest.resolve(`ytmsearch:${searchQuery}`);
                    if (!res || !res.data || !Array.isArray(res.data) || res.data.length === 0) {
                        res = await node.rest.resolve(`ytsearch:${searchQuery}`);
                    }
                    if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
                        const fallbackCandidate = res.data.find((t) => t.info?.identifier !== current.info?.identifier) || res.data[0];
                        if (fallbackCandidate && fallbackCandidate.info?.identifier !== current.info?.identifier) {
                            const fallbackTrack = { ...fallbackCandidate, requester: current.requester, _isFallback: true };
                            this.current = fallbackTrack;
                            const encodedTrack = fallbackTrack.encoded || fallbackTrack.track;
                            await this.player.playTrack({ track: { encoded: encodedTrack } });
                            return;
                        }
                    }
                }
            }
            catch (fallbackErr) {
                logger.error(`Stream fallback failed for guild ${this.guildId}:`, fallbackErr);
            }
        }
        const errMessage = error?.exception?.message || error?.message || "All clients failed to stream the track";
        this.textChannel.send(MusicEmbedBuilder.error(`Could not stream this track from YouTube.\n\n**Details:** \`${errMessage.substring(0, 200)}\``)).catch(() => { });
        if (trackId)
            this.fallbackCandidatesMap.delete(trackId);
        this.playNext();
    }
    startIdleTimer() {
        this.clearIdleTimer();
        this.idleTimeout = setTimeout(() => {
            if (this.tracks.length === 0 && !this.current && !this.twentyFourSeven) {
                logger.info(`Idle timeout expired in guild ${this.guildId}. Leaving voice channel.`);
                this.textChannel.send(MusicEmbedBuilder.success("Disconnected", "Left the voice channel due to 2 minutes of inactivity. Use `/play` to play again!")).catch(() => { });
                this.destroy();
            }
        }, 120000); // 2 minutes
    }
    clearIdleTimer() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    }
    cleanupFallbacks() {
        this.fallbackCandidatesMap.clear();
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
        this.clearIdleTimer();
        this.cleanupFallbacks();
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
