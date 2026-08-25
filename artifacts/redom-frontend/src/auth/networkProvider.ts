import { api } from "../api/client";

export interface NetworkProviderResponse {
  success: boolean;
  networkProvider: string | null;
}

let cachedNetworkProvider:
  | string
  | null = null;

let loaded = false;

export async function fetchNetworkProvider(): Promise<
  string | null
> {
  try {
    const response =
      await api.get<NetworkProviderResponse>(
        "/auth/network-provider",
      );

    cachedNetworkProvider =
      response.networkProvider ??
      null;

    loaded = true;

    return cachedNetworkProvider;
  } catch {
    cachedNetworkProvider = null;
    loaded = true;

    return null;
  }
}

export function setNetworkProvider(
  provider: string | null,
): void {
  cachedNetworkProvider =
    provider;

  loaded = true;
}

export function getNetworkProvider(): string | null {
  return cachedNetworkProvider;
}

export function hasLoadedNetworkProvider(): boolean {
  return loaded;
}

export function clearNetworkProvider(): void {
  cachedNetworkProvider = null;
  loaded = false;
}