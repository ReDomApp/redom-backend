import dotenv from "dotenv";

dotenv.config();
import app from "./app";
import { pool } from "./database/db";
import { logger } from "./lib/logger";
import {
  startRegistrationChallengeCleanup,
  stopRegistrationChallengeCleanup,
} from "./services/auth/registration-challenge-cleanup.service";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: \"${rawPort}\"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ error: serializeError(err) }, "Error listening on port");
    process.exit(1);
  }

  startRegistrationChallengeCleanup();
  logger.info({ port }, "Server listening");
});

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown requested");
  stopRegistrationChallengeCleanup();

  server.close(async (error) => {
    if (error) {
      logger.error({ error: serializeError(error) }, "Error closing HTTP server");
      process.exitCode = 1;
    }

    try {
      await pool.end();
    } catch (poolError) {
      logger.error(
        { error: serializeError(poolError) },
        "Error closing database pool",
      );
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
