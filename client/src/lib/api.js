import axios from "axios";

export const TOKEN_KEY = "token";
export const SESSION_EXPIRED_EVENT = "airbuenas:session-expired";

// The API client. Defaults to /api on this origin (Vite proxies it in
// development; Vercel routes it in production).
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || "/api", timeout: 20_000 });

export const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on an authenticated request means the session is no longer valid.
api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status === 401 && error.config?.headers?.Authorization) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return Promise.reject(error);
});

// A user-facing message for a failed request.
export const errorMessage = (error, fallback = "Something went wrong. Please try again.") => {
  const data = error?.response?.data;
  if (typeof data?.error === "string") return data.error;
  if (typeof data === "string" && data) return data;
  if (error?.code === "ECONNABORTED") return "The server took too long to respond. Please try again.";
  if (error && !error.response && error.request) return "Can't reach the server. Check your connection and try again.";
  return fallback;
};
