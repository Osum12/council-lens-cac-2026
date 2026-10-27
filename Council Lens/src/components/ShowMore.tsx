import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * A long list shown a step at a time. The count resets whenever `resetKey` changes (a new search
 * or filter), so a narrowed list never opens part-way down.
 */
export function useStepped<T>(items: T[], first: number, step: number, resetKey: string) {
  const [state, setState] = useState({ key: resetKey, count: first });
  if (state.key !== resetKey) setState({ key: resetKey, count: first });
  const count = state.key === resetKey ? state.count : first;
  const listRef = useRef<HTMLElement | null>(null);
  const more = () => {
    const shown = count;
    flushSync(() => setState({ key: resetKey, count: count + step }));
    // Move focus to the first newly shown entry, so keyboard users carry on reading from there.
    listRef.current?.querySelector<HTMLElement>(`:scope > li:nth-child(${shown + 1}) a, :scope > li:nth-child(${shown + 1}) button`)?.focus();
  };
  return { visible: items.slice(0, count), remaining: Math.max(0, items.length - count), more, listRef, step };
}

/** "Show 24 more (1,180 left)": appears only while part of the list is hidden. */
export function ShowMoreButton({ remaining, step, noun, onClick }: { remaining: number; step: number; noun: string; onClick: () => void }) {
  if (remaining <= 0) return null;
  const next = Math.min(step, remaining);
  return (
    <button type="button" className="button button--ghost show-more" onClick={onClick}>
      Show {next} more {noun}
      {remaining > next && <span className="show-more__left"> ({remaining.toLocaleString('en-US')} not shown yet)</span>}
    </button>
  );
}
