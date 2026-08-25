import {
  api,
} from "./../api/client";

export interface NetworkProviderResponse {
  success: boolean;
  networkProvider:
    | string
    | null;
}

export async function fetchNetworkProvider(): Promise<
  string | null
> {
  try {
    const response =
      await api.get<NetworkProviderResponse>(
        "/auth/network-provider",
      );

    return (
      response.networkProvider ??
      null
    );
  } catch {
    return null;
  }
}