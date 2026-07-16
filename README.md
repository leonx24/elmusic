# elmusic - Discord Music Bot for leon x server

Discord Music Bot premium berbasis TypeScript menggunakan **Discord.js v14** dan **Shoukaku** (Lavalink wrapper). Memiliki arsitektur modular yang rapi, bersih, dan mudah dipahami.

## Fitur Utama
* 🎵 **Slash Commands (/)**: Standar modern interaksi Discord.
* ⚡ **Lavalink Audio System**: Ringan, andal, dan mendukung streaming berkualitas tinggi.
* 📂 **Modular Structure**: File dipisahkan berdasarkan Command, Event, Structure, dan Utils.
* 🎨 **Estetika Premium**: Desain Rich Embed yang indah terinspirasi dari Jockie Music/HD Music.

## Struktur Direktori
```text
elmusic/
├── src/
│   ├── commands/             # Handler Command berdasarkan kategori
│   │   ├── music/            # play, skip
│   ├── events/               # Event handler untuk Client
│   ├── structures/           # Class & Wrapper Utama (BotClient, Command, Event, Queue)
│   ├── utils/                # Helper (embeds, logger)
│   ├── config.ts             # Pengaturan konfigurasi & env variables
│   └── index.ts              # Entrypoint utama
```

## Persyaratan
* **Node.js** v18 atau v20 ke atas.
* **Lavalink Server** v4.x (Anda memerlukan server/node Lavalink yang aktif).
* **Token Discord Bot** dengan Gateway Intents diaktifkan:
  - Guilds
  - Guild Voice States
  - Guild Messages
  - Message Content

## Langkah Instalasi & Penggunaan

### 1. Klon / Download & Instalasi Dependensi
Jalankan perintah berikut di direktori proyek:
```bash
npm install
```

### 2. Konfigurasi Variabel Lingkungan
Salin file `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Buka file `.env` dan lengkapi konfigurasi berikut:
* `DISCORD_TOKEN`: Token bot Anda dari [Discord Developer Portal](https://discord.com/developers/applications).
* `CLIENT_ID`: ID Aplikasi/Bot Anda.
* `GUILD_ID`: ID Server Discord Anda (opsional, disarankan untuk pendaftaran Slash Command instan selama pengembangan).
* `LAVALINK_HOST`: Alamat host server Lavalink Anda (default: `localhost`).
* `LAVALINK_PORT`: Port server Lavalink Anda (default: `2333`).
* `LAVALINK_PASS`: Password otentikasi Lavalink Anda (default: `youshallnotpass`).

### 3. Cara Menjalankan Bot

#### Mode Pengembangan (Development)
Menjalankan bot dengan reload otomatis menggunakan `nodemon` dan `ts-node`:
```bash
npm run dev
```

#### Mode Produksi (Production)
Kompilasi TypeScript menjadi JavaScript lalu jalankan bot:
```bash
npm run build
npm start
```

---

Dibuat khusus untuk server **leon x**. Selamat mendengarkan musik! 🎧
