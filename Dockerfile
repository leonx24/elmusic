# Use a lightweight Debian-based Node.js image
FROM node:20-bookworm-slim

# Install Java 17, curl (to download Lavalink), and other dependencies
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy all source files
COPY . .

# Download the latest Lavalink v4 jar since it's gitignored
RUN mkdir -p lavalink && \
    curl -Lo lavalink/Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar

# Build the TypeScript project
RUN npm run build

# Make the start script executable
RUN chmod +x start.sh

# Start the application
CMD ["./start.sh"]
