import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading records…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children && <div className="state__body">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">We couldn’t load these records.</p>
      <p className="state__body">{message ?? 'Something went wrong while reading the data. Your connection or the data file may be unavailable.'}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
