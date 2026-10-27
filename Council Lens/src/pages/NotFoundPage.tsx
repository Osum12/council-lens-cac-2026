import { Link } from 'react-router-dom';
import { usePlace, usePlaceHref } from '../services/placeContext';
import { usePageTitle } from '../services/usePageTitle';

const COPY = {
  page: { title: 'Page not found', body: 'That link doesn’t match a page in this app.' },
  location: { title: 'Location not found', body: 'That link doesn’t match a Georgia county or city in our directory. Choose a location to continue.' },
  issue: { title: 'Issue not found', body: 'This issue isn’t in the current dataset. It may have been removed or the link may be mistyped.' },
  meeting: { title: 'Meeting not found', body: 'This meeting isn’t in the current dataset. It may have been removed or the link may be mistyped.' },
  document: { title: 'Document not found', body: 'This document isn’t in the current dataset. It may have been removed or the link may be mistyped.' },
};

export function NotFound({ kind = 'page' }: { kind?: keyof typeof COPY }) {
  usePageTitle(COPY[kind].title);
  const city = usePlace();
  const href = usePlaceHref();
  return (
    <div className="page">
      <div className="state state--empty state--page">
        <h1 className="state__title">{COPY[kind].title}</h1>
        <p className="state__body">{COPY[kind].body}</p>
        <div className="button-row">
          {city ? (
            <>
              <Link to={href('/')} className="button">
                Go to Countywide
              </Link>
              <Link to={href('/archive')} className="button button--ghost">
                Browse the archive
              </Link>
            </>
          ) : (
            <Link to="/" className="button">
              Choose a location
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return <NotFound kind="page" />;
}
