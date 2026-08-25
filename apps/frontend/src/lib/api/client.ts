import type { AxiosError } from "axios";
import axios from "axios";

import { clientEnvironment } from "../env";

/**
 * Single axios instance for the whole console. The bearer token is attached
 * lazily from the auth store on every request (avoids the global-axios
 * mutation pattern and survives store rehydration ordering).
 */
export const apiClient = axios.create({
  baseURL: clientEnvironment.NEXT_PUBLIC_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

let readToken: (() => string | null) | null = null;
let onUnauthorized: (() => void) | null = null;

export function bindAuth(reader: () => string | null, unauthorizedHandler: () => void): void {
  readToken = reader;
  onUnauthorized = unauthorizedHandler;
}

apiClient.interceptors.request.use((config) => {
  const token = readToken?.();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** Extract a human-readable message from any API error. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      { message?: string | string[]; error?: string | { message?: string } } | undefined;
    const message = data?.message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
    // The API's error envelope nests the message under `error.message`.
    if (data?.error && typeof data.error === "object" && typeof data.error.message === "string") {
      return data.error.message;
    }
    if (typeof data?.error === "string") return data.error;
    if (error.code === "ECONNABORTED") return "Request timed out — the API may be unavailable.";
    if (!error.response) return "Cannot reach the API. Check that the backend is running.";
    return `Request failed with status ${String(error.response.status)}`;
  }
  return error instanceof Error ? error.message : "Unexpected error";
}
