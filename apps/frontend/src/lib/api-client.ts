import axios from "axios";

import { clientEnvironment } from "./env";

export const apiClient = axios.create({
  baseURL: clientEnvironment.NEXT_PUBLIC_API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
  withCredentials: true,
});
