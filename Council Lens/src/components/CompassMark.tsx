/** Council Lens's map-legend mark: a four-point compass star in a fine ring. Decorative only. */
export function CompassMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`compass ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M12 1.5 13.9 10.1 22.5 12 13.9 13.9 12 22.5 10.1 13.9 1.5 12 10.1 10.1Z" fill="currentColor" />
    </svg>
  );
}
