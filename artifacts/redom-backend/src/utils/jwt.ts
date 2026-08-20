import jwt from "jsonwebtoken";

import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
  profileId: string;
  sessionId: string;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
}

export function generateAccessToken(
  payload: AccessTokenPayload,
): string {
  return jwt.sign(
    payload,
    env.authentication
      .jwtAccessSecret,
    {
      expiresIn: "15m",
    },
  );
}

export function generateRefreshToken(
  payload: RefreshTokenPayload,
): string {
  return jwt.sign(
    payload,
    env.authentication
      .jwtRefreshSecret,
    {
      expiresIn: "30d",
    },
  );
}

export function verifyAccessToken(
  token: string,
): AccessTokenPayload {
  return jwt.verify(
    token,
    env.authentication
      .jwtAccessSecret,
  ) as AccessTokenPayload;
}

export function verifyRefreshToken(
  token: string,
): RefreshTokenPayload {
  return jwt.verify(
    token,
    env.authentication
      .jwtRefreshSecret,
  ) as RefreshTokenPayload;
}