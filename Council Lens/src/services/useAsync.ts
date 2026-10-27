import { useCallback, useEffect, useState } from 'react';
import { resetDataCache } from './civicData';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: T };

/**
 * Runs an async data request and tracks loading/error/ready.
 * `deps` (simple values such as a route ID) restart the request; `retry` reloads the dataset.
 * Each result is stored with the request key that produced it, so a stale result
 * is never shown while a new request is still loading.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: (string | number | boolean | null | undefined)[]): AsyncState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([...deps, attempt]);
  const [result, setResult] = useState<{ key: string; state: AsyncState<T> } | null>(null);

  useEffect(() => {
    let active = true;
    fn().then(
      (data) => {
        if (active) setResult({ key, state: { status: 'ready', data } });
      },
      (error: unknown) => {
        if (active) setResult({ key, state: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } });
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => {
    resetDataCache();
    setAttempt((n) => n + 1);
  }, []);

  const state: AsyncState<T> = result?.key === key ? result.state : { status: 'loading' };
  return { ...state, retry };
}
