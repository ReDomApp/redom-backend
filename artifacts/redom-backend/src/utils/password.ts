import bcrypt from "bcrypt";
import { env } from "../config/env";

export async function hashPassword(
  password: string,
): Promise<string> {
  return bcrypt.hash(
    password,
    env.authentication.bcryptRounds,
  );
}

export async function verifyPassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}