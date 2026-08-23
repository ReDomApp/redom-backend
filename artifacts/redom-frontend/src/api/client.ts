import { getStoredSession } from "../auth/storage";
import { env } from "../config/env";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiRequestOptions {
  method?:
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";

  body?: unknown;

  headers?: Record<string, string>;

  accessToken?: string;

  signal?: AbortSignal;
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  return `${env.apiBaseUrl}${normalizedPath}`;
}

async function parseResponse(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  return text.length > 0 ? text : null;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  let accessToken = options.accessToken;

  if (!accessToken) {
    const storedSession =
      await getStoredSession();

    accessToken =
      storedSession?.accessToken;
  }

  if (accessToken) {
    headers.set(
      "Authorization",
      `Bearer ${accessToken}`,
    );
  }

  const response = await fetch(
    buildUrl(path),
    {
      method: options.method ?? "GET",
      headers,
      signal: options.signal,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    },
  );

  const payload =
    await parseResponse(response);

  if (!response.ok) {
    const body =
      typeof payload === "object" &&
      payload !== null
        ? (payload as Record<string, unknown>)
        : undefined;

    throw new ApiError(
      typeof body?.message === "string"
        ? body.message
        : `Request failed with status ${response.status}`,
      response.status,
      typeof body?.code === "string"
        ? body.code
        : undefined,
      body,
    );
  }

  return payload as T;
}

export const api = {
  get<T>(
    path: string,
    options?: Omit<
      ApiRequestOptions,
      "method" | "body"
    >,
  ) {
    return apiRequest<T>(path, {
      ...options,
      method: "GET",
    });
  },

  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<
      ApiRequestOptions,
      "method" | "body"
    >,
  ) {
    return apiRequest<T>(path, {
      ...options,
      method: "POST",
      body,
    });
  },

  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<
      ApiRequestOptions,
      "method" | "body"
    >,
  ) {
    return apiRequest<T>(path, {
      ...options,
      method: "PUT",
      body,
    });
  },

  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<
      ApiRequestOptions,
      "method" | "body"
    >,
  ) {
    return apiRequest<T>(path, {
      ...options,
      method: "PATCH",
      body,
    });
  },

  delete<T>(
    path: string,
    options?: Omit<
      ApiRequestOptions,
      "method" | "body"
    >,
  ) {
    return apiRequest<T>(path, {
      ...options,
      method: "DELETE",
    });
  },
};