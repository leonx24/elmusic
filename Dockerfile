FROM node:22-bookworm-slim

# Install python3, ffmpeg, build tools, and curl
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy all source files and build TypeScript
COPY . .
RUN npm run build

# Start the bot
CMD ["npm", "start"]
