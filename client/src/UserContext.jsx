/* eslint-disable react-refresh/only-export-components -- context + provider live together */
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";
import toast from "react-hot-toast";
import { SESSION_EXPIRED_EVENT, TOKEN_KEY } from "./lib/api";

export const UserContext = createContext({ user: null, ready: true, login: () => {}, logout: () => {} });

// The signed-in user, decoded from the stored JWT. Expired or malformed
// tokens are discarded.
export const readSession = () => {
  let token;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const payload = jwtDecode(token);
    if (payload.exp && payload.exp * 1000 <= Date.now()) throw new Error("expired");
    return { id: payload.sub ?? payload.id, name: payload.name, email: payload.email };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
};

export const UserContextProvider = ({ children }) => {
  const [user, setUser] = useState(readSession);

  const login = useCallback((token) => {
    localStorage.setItem(TOKEN_KEY, token);
    setUser(readSession());
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    // The API rejected our token (expired or revoked).
    const onExpired = (event) => {
      if (!readSession() && !localStorage.getItem(TOKEN_KEY)) return;
      logout();
      toast.error(event.detail?.reason ?? "Your session has expired. Please log in again.", { id: "session-expired" });
    };
    // Logged in or out in another tab.
    const onStorage = (event) => {
      if (event.key === TOKEN_KEY || event.key === null) setUser(readSession());
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener("storage", onStorage);
    };
  }, [logout]);

  const value = useMemo(() => ({ user, ready: true, login, logout }), [user, login, logout]);
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};
