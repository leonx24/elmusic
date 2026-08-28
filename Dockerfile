FROM node:20-bookworm-slim

# Install python3, ffmpeg, and curl (required by yt-dlp & audio streaming)
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy all source files and build
COPY . .
RUN npm run build

# Start the bot directly via Node.js
CMD ["npm", "start"]
