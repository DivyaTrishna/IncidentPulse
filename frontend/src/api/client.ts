import axios from "axios";

// Falls back to the local dev backend if VITE_API_URL isn't set, so
// `npm run dev` works out of the box without requiring a .env file first.
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || "http://127.0.0.1:8000";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 4000,
  headers: { "Content-Type": "application/json" },
});

export const API_BASE_URL = BASE_URL;
