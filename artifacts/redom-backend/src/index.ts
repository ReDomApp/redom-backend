import dotenv from "dotenv";

dotenv.config();
import app from "./app";
import { pool } from "./database/db";
import { logger } from "./lib/logger";
import {
  startRegistrationChallengeCleanup,
  stopRegistrationChallengeCleanup,
} from "./services/auth/registration-challenge-cleanup.service";
import {
  startRegistrationFlowReservationCleanup,
  stopRegistrationFlowReservationCleanup,
} from "./services/auth/registration-flow-reservation-cleanup.service";

// Render supplies PORT for web services. Keep 10000 as a safe local/default
// fallback so the process can still start when PORT is not explicitly set.
const rawPort = process.env["PORT"] ?? "10000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bind explicitly to all interfaces. Render's health/port scanner connects
// through the container network, so binding only to localhost would make the
// service appear down even though the Node process is running.
const host = "0.0.0.0";

const server = app.listen(port, host, () => {
  startRegistrationChallengeCleanup();
  startRegistrationFlowReservationCleanup();
  logger.info({ host, port }, "Server listening");
});

server.on("error", (error) => {
  logger.error({ error: serializeError(error), host, port }, "HTTP server error");
  process.exit(1);
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
  stopRegistrationFlowReservationCleanup();

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
