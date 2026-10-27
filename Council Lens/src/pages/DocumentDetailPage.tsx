import { useParams } from 'react-router-dom';
import { getDocumentById, getMeetingById, getRelatedIssuesForDocument } from '../services/civicData';
import { formatDate, humanize } from '../services/format';
import { useAsync } from '../services/useAsync';
import { usePageTitle } from '../services/usePageTitle';
import { IssueCard, MeetingCard } from '../components/Cards';
import { MockBadge, MockNotice, isMock } from '../components/MockBadge';
import { SourceAction } from '../components/SourceAction';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { NotFound } from './NotFoundPage';
import { BackLink } from '../components/BackLink';
import { usePlaceHref } from '../services/placeContext';
import { nb } from '../components/nb';

export function DocumentDetailPage() {
  const href = usePlaceHref();
  const { documentId = '' } = useParams();
  const state = useAsync(async () => {
    const document = await getDocumentById(documentId);
    if (!document) return null;
    const [meeting, issues] = await Promise.all([
      document.meetingId ? getMeetingById(document.meetingId) : Promise.resolve(null),
      getRelatedIssuesForDocument(documentId),
    ]);
    return { document, meeting, issues };
  }, [documentId]);
  usePageTitle(state.status === 'ready' && state.data ? state.data.document.title : 'Document');

  if (state.status === 'loading') return <div className="page"><LoadingState /></div>;
  if (state.status === 'error') return <div className="page"><ErrorState onRetry={state.retry} /></div>;
  if (!state.data) return <NotFound kind="document" />;

  const { document: doc, meeting, issues } = state.data;

  return (
    <article className="page detail detail--document">
      <BackLink fallbackTo={href('/archive')} fallbackLabel="Archive" />
      <header className="detail__header">
        <div className="card__top">
          <span className="tag">{humanize(doc.documentType)}</span>
          {isMock(doc) && <MockBadge record={doc} size="lg" />}
        </div>
        <h1 className="detail__title">{doc.title}</h1>
        {doc.publishedDate && <p className="muted">Published {nb(formatDate(doc.publishedDate))}</p>}
      </header>
      <MockNotice record={doc} kind="document" />

      <div className="detail__grid">
        <div className="detail__main">
          <section aria-labelledby="d-about-h">
            <h2 id="d-about-h">About this document</h2>
            <p className="prose">{doc.description || 'No description has been recorded for this document.'}</p>
          </section>

          <section aria-labelledby="d-meeting-h">
            <h2 id="d-meeting-h">From meeting</h2>
            {meeting ? (
              <MeetingCard meeting={meeting} />
            ) : (
              <EmptyState title={doc.meetingId ? 'The linked meeting could not be found in the dataset.' : 'This document is not tied to a meeting.'} />
            )}
          </section>

          <section aria-labelledby="d-issues-h">
            <h2 id="d-issues-h">Related issues</h2>
            {issues.length ? (
              <ul className="issue-list">
                {issues.map((i) => (
                  <li key={i.id}>
                    <IssueCard issue={i} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No issues are linked to this document." />
            )}
          </section>
        </div>

        <aside className="detail__side">
          <section className="panel" aria-labelledby="d-file-h">
            <h2 id="d-file-h">Original file</h2>
            <SourceAction url={doc.url} label="Open the original document" unavailableText="No file is linked for this record" />
            <p className="muted">Source: {doc.sourceName ?? 'not recorded'}</p>
          </section>
        </aside>
      </div>
    </article>
  );
}
