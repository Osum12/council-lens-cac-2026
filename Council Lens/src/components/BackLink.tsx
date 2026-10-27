import { Link, useNavigate } from 'react-router-dom';

/**
 * "Back" that returns to the previous page inside the app when there is one
 * (e.g. from Near Me back to the map), and otherwise links to a sensible parent.
 */
export function BackLink({ fallbackTo, fallbackLabel }: { fallbackTo: string; fallbackLabel: string }) {
  const navigate = useNavigate();
  // React Router records the history index; idx > 0 means we arrived from another app page.
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0;
  return (
    <nav aria-label="Back" className="backlink">
      {canGoBack ? (
        <button type="button" className="backlink__button" onClick={() => navigate(-1)}>
          <span aria-hidden="true" className="icon-lead">←</span>Back
        </button>
      ) : (
        <Link to={fallbackTo}>
          <span aria-hidden="true" className="icon-lead">←</span>
          {fallbackLabel}
        </Link>
      )}
    </nav>
  );
}
