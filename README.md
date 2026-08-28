# elmusic - Discord Music Bot for leon x server

Discord Music Bot premium berbasis TypeScript menggunakan **Discord.js v14** dan **DisTube** (`@discordjs/voice`). Berjalan langsung di Node.js tanpa Lavalink.

## Fitur Utama
* 🎵 **DisTube Engine**: Audio playback cepat & native via `@discordjs/voice` dan `yt-dlp`.
* 🟢 **Spotify-First Resolution**: Metadata pencarian disinkronkan ke Spotify resmi via `@spotify/web-api-ts-sdk` agar tidak memutar cover/slowed yang salah.
* 🍪 **YouTube Cookies Support**: Mendukung `YOUTUBE_COOKIES` untuk melewati deteksi bot / SABR.
* ⚡ **Slash Commands & Prefix**: Mendukung `/play` dan `!play <query>`.
* 📂 **Modular Structure**: Arsitektur rapi (Command, Event, Structure, Utils).
* 🎨 **Estetika Premium**: Desain Rich Embed Discord Components V2.

## Struktur Direktori
```text
elmusic/
├── src/
│   ├── commands/             # Handler Command berdasarkan kategori
│   │   ├── music/            # play, skip, queue, loop, autoplay, volume, leave, 247, lyrics, help
│   ├── events/               # Event handler untuk Client
│   ├── structures/           # BotClient, Command, Event
│   ├── utils/                # Helper (embeds, logger, spotify)
│   ├── config.ts             # Pengaturan konfigurasi & env variables
│   └── index.ts              # Entrypoint utama
```

## Persyaratan
* **Node.js** v20 ke atas.
* **FFmpeg** & **Python 3** terpasang di sistem.
* **Token Discord Bot** dengan Gateway Intents diaktifkan:
  - Guilds
  - Guild Voice States
  - Guild Messages
  - Message Content

## Variabel Lingkungan (.env)
* `DISCORD_TOKEN`: Token bot Discord.
* `CLIENT_ID`: Application ID bot.
* `GUILD_ID`: ID Guild Discord (opsional).
* `SPOTIFY_CLIENT_ID`: Client ID dari Spotify Dashboard (opsional).
* `SPOTIFY_CLIENT_SECRET`: Client Secret dari Spotify Dashboard (opsional).
* `YOUTUBE_COOKIES`: Isi teks cookies YouTube format Netscape (opsional).
* `EMBED_COLOR`: Warna aksen embed (hex).
* `PREFIX`: Prefix command teks (default: `!`).

## Cara Menjalankan Bot
```bash
npm install
npm run build
npm start
```
