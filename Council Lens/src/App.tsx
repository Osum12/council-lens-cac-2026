import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LEGACY_COUNTY_ID } from './config/coverage';
import { Layout } from './components/Layout';
import { CityScope, CountyScope } from './components/PlaceScope';
import { LoadingState } from './components/States';
import { GeorgiaHomePage } from './pages/GeorgiaHomePage';
import { CitywidePage } from './pages/CitywidePage';
import { IssueDetailPage } from './pages/IssueDetailPage';
import { MeetingDetailPage } from './pages/MeetingDetailPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import { ArchivePage } from './pages/ArchivePage';
import { CalendarPage } from './pages/CalendarPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PAGE_SECTIONS } from './services/jurisdictions';

// Near Me pulls in the map library, so it loads only when someone opens it.
const NearMePage = lazy(() => import('./pages/NearMePage').then((m) => ({ default: m.NearMePage })));

const legacyPrefix = `/county/${LEGACY_COUNTY_ID}`;

/** The app's original links (/archive, /issues/…) showed these records; send them to the same page under the county. */
function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate replace to={`${legacyPrefix}${pathname}${search}${hash}`} />;
}

/** "/" used to be the issue list, so old filtered links (/?topic=…) still go there; otherwise "/" is the location chooser. */
const ISSUE_FILTER_KEYS = ['q', 'topic', 'status', 'when'];
function Home() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  if (ISSUE_FILTER_KEYS.some((k) => params.has(k))) return <Navigate replace to={`${legacyPrefix}${search}${hash}`} />;
  return <GeorgiaHomePage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        {PAGE_SECTIONS.map((s) => (
          <Route key={s} path={s === 'near-me' || s === 'archive' || s === 'calendar' ? s : `${s}/:id`} element={<LegacyRedirect />} />
        ))}
        <Route path="county/:countyId" element={<CountyScope />}>
          <Route index element={<CitywidePage />} />
          <Route
            path="near-me"
            element={
              <Suspense fallback={<div className="page"><LoadingState label="Loading map…" /></div>}>
                <NearMePage />
              </Suspense>
            }
          />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="issues/:issueId" element={<IssueDetailPage />} />
          <Route path="meetings/:meetingId" element={<MeetingDetailPage />} />
          <Route path="documents/:documentId" element={<DocumentDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path=":cityId/*" element={<CityScope />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
