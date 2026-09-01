import dotenv from "dotenv";

dotenv.config();
import app from "./app";
import "./database/db";
import { pool } from "./database/db";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown requested");

  server.close(async (error) => {
    if (error) {
      logger.error({ error }, "Error closing HTTP server");
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      logger.error({ error: poolError }, "Error closing database pool");
      process.exitCode = 1;
    } finally {
      process.exit();
    }
  });
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
