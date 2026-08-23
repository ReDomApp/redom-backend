export interface ApiSuccess<T> {
  data: T;
}

export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}

export type LoadingState =
  | "idle"
  | "loading"
  | "success"
  | "error";