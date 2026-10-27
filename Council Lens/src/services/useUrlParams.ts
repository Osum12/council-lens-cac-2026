import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** A copy of the params with one key set, or removed when the value is empty. */
export function withParam(prev: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const p = new URLSearchParams(prev);
  if (value) p.set(key, value);
  else p.delete(key);
  return p;
}

/**
 * Read and update URL search params without losing quick successive changes.
 * React Router's own setter starts from the params of the last render, so a chip click
 * followed at once by typing could undo the click. This keeps the latest params in a ref.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);

  const replace = (next: URLSearchParams) => {
    latest.current = next;
    setParams(next, { replace: true });
  };
  const setParam = (key: string, value: string | null) => replace(withParam(latest.current, key, value));
  const clearParams = () => replace(new URLSearchParams());
  return { params, setParam, clearParams };
}

/** The param's value in the address bar right now, or null outside a browser. */
function liveParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key) ?? '';
}

/**
 * Text for a search box mirrored to one URL param. The box keeps its own text, so fast typing
 * is never lost while the URL catches up, and it follows the URL when the URL changes to
 * something the box didn't write (a nav link, "Clear filters", Back).
 * The router applies URL changes in a transition, so a render can briefly see an older URL
 * than the address bar holds. A value the box wrote, or started from, that no longer matches
 * the address bar comes from such a render and is ignored.
 */
export function useUrlText(params: URLSearchParams, setParam: (key: string, value: string | null) => void, key: string) {
  const fromUrl = params.get(key) ?? '';
  const [state, setState] = useState({ text: fromUrl, seenUrl: fromUrl, ours: [fromUrl] });
  if (fromUrl !== state.seenUrl) {
    // Our write catching up, or a render that still shows an older value of ours: keep the text.
    // The box's latest write is always in the address bar, so an older value of ours that the
    // address bar holds again was put there by something else.
    const live = liveParam(key) ?? fromUrl;
    if (state.ours.includes(fromUrl) && (fromUrl !== live || fromUrl === state.text)) {
      setState({ ...state, seenUrl: fromUrl });
    } else {
      setState({ text: fromUrl, seenUrl: fromUrl, ours: [fromUrl] });
    }
  }
  const setText = (next: string) => {
    setState((s) => ({ ...s, text: next, ours: s.ours.includes(next) ? s.ours : [...s.ours, next] }));
    setParam(key, next);
  };
  return [state.text, setText] as const;
}
