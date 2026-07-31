import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
  profileId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
}

export function generateAccessToken(
  payload: AccessTokenPayload,
): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });
}

export function generateRefreshToken(
  payload: RefreshTokenPayload,
): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
}

export function verifyAccessToken(
  token: string,
): AccessTokenPayload {
  return jwt.verify(
    token,
    env.JWT_ACCESS_SECRET,
  ) as AccessTokenPayload;
}

export function verifyRefreshToken(
  token: string,
): RefreshTokenPayload {
  return jwt.verify(
    token,
    env.JWT_REFRESH_SECRET,
  ) as RefreshTokenPayload;
}