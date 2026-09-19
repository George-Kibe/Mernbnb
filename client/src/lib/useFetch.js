import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// GET `url` (with optional query params) and track loading/error state.
// The result remembers which request it answers, so `loading` is derived
// (no state reset inside the effect) and late responses are ignored.
export const useFetch = (url, params) => {
  const paramsKey = JSON.stringify(params ?? {});
  const [attempt, setAttempt] = useState(0);
  const requestKey = url ? `${url}|${paramsKey}|${attempt}` : null;
  const [result, setResult] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!requestKey) return undefined;
    let cancelled = false;
    api
      .get(url, { params: JSON.parse(paramsKey) })
      .then(({ data }) => {
        if (!cancelled) setResult({ key: requestKey, data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setResult({ key: requestKey, data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, url, paramsKey]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = requestKey !== null && result.key === requestKey;
  return {
    data: current ? result.data : null,
    error: current ? result.error : null,
    loading: requestKey !== null && !current,
    reload,
  };
};
