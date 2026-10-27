import type { ReactNode } from 'react';
import { safeUrl } from '../services/format';

/**
 * The link text with the "↗" glued to its last word, so the arrow never wraps onto a
 * line of its own. One wrapping span keeps the label a single flex item in pill buttons. `after` (screen-reader-only text) sits inside the same unbreakable run.
 */
export function ArrowLabel({ text, after }: { text: string; after?: ReactNode }) {
  const cut = text.lastIndexOf(' ') + 1;
  return (
    <span>
      {text.slice(0, cut)}
      <span className="nowrap">
        {text.slice(cut)}
        {after}
        <span aria-hidden="true">{' ↗'}</span>
      </span>
    </span>
  );
}

type Props = {
  url: string | null | undefined;
  label: string;
  /** Shown instead of a link when the URL is missing or invalid. */
  unavailableText: string;
};

/**
 * Renders an outbound source link only when a valid http(s) URL exists.
 * A null URL becomes plain, non-interactive text, never a dead button.
 */
export function SourceAction({ url, label, unavailableText }: Props) {
  const href = safeUrl(url);
  if (!href) {
    return (
      <span className="source-action source-action--unavailable">
        <span aria-hidden="true">⊘</span> {unavailableText}
      </span>
    );
  }
  return (
    <a className="source-action" href={href} target="_blank" rel="noopener noreferrer">
      <ArrowLabel text={label} />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
