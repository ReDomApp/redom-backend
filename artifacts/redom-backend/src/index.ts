import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

dotenv.config();
import app from "./app";
import { db, pool } from "./database/db";
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
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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

async function startServer() {
  const artifactDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(artifactDir, "../drizzle");

  try {
    await migrate(db, { migrationsFolder });
    logger.info({ migrationsFolder }, "Database migrations applied");
  } catch (error) {
    logger.error(
      { migrationError: serializeError(error), migrationsFolder },
      "Database migration failed; server will not start",
    );
    await pool.end().catch((poolError) => {
      logger.error(
        { poolError: serializeError(poolError) },
        "Error closing database pool after migration failure",
      );
    });
    process.exit(1);
  }

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ error: serializeError(err) }, "Error listening on port");
      process.exit(1);
    }

    startRegistrationChallengeCleanup();
    logger.info({ port }, "Server listening");
  });

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
}

void startServer();
