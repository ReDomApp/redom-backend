import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const env = {
  // Application
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3000),

  // Database
  DATABASE_URL: required("DATABASE_URL"),

  // Authentication
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  SESSION_SECRET: required("SESSION_SECRET"),

  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 12),
};