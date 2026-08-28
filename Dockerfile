FROM node:22-bookworm-slim

# Install python3, ffmpeg, build tools, curl, and unzip
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    unzip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (required by yt-dlp to solve YouTube JS signature / cipher challenge)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy all source files and build TypeScript
COPY . .
RUN npm run build

# Start the bot
CMD ["npm", "start"]
