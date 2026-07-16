import { BotClient } from "./structures/BotClient.js";
import { logger } from "./utils/logger.js";

const client = new BotClient();

client.start().catch((error) => {
  logger.error("Failed to start the Discord Music Bot:", error);
  process.exit(1);
});

// Handle unhandled rejections and exceptions to prevent bot from crashing unpredictably
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception thrown:", error);
});
