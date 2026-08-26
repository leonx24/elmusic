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

# Pin Lavalink version instead of using `latest`
ARG LAVALINK_VERSION=4.2.2
RUN mkdir -p lavalink && \
    curl -L -o lavalink/Lavalink.jar \
    https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar

# Build the TypeScript project
RUN npm run build

# Make the start script executable
RUN chmod +x start.sh

# Healthcheck — Railway will detect if Lavalink is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:2333/version || exit 1

# Start the application
CMD ["./start.sh"]
