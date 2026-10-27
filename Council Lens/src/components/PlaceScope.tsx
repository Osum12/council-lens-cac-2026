import { Outlet, useParams } from 'react-router-dom';
import { getDatasetInfo } from '../services/civicData';
import { PlaceContext } from '../services/placeContext';
import { getCounty, getMunicipality } from '../services/jurisdictions';
import { useAsync } from '../services/useAsync';
import { ComingSoon } from '../pages/ComingSoonPage';
import { NotFound } from '../pages/NotFoundPage';

/**
 * The one gate in front of every county page (/county/:countyId/…). Civic records load only
 * when the county is covered (src/config/coverage.ts). Any other county gets Coming Soon for
 * every sub-path, so a stale link like /county/cobb/archive?q=… never reaches the records.
 */
export function CountyScope() {
  const { countyId } = useParams();
  const county = getCounty(countyId);
  if (!county) return <NotFound kind="location" />;
  if (!county.civicDataAvailable) return <ComingSoon place={county} />;
  return (
    <PlaceContext.Provider value={county}>
      <SampleDataBanner />
      <Outlet />
    </PlaceContext.Provider>
  );
}

/** /:cityId/… Cities have no pages of their own yet: every city shows Coming Soon, on every sub-path. */
export function CityScope() {
  const { cityId } = useParams();
  const city = getMunicipality(cityId);
  return city ? <ComingSoon place={city} /> : <NotFound kind="location" />;
}

/** Shown only when the loaded dataset contains mock records (the test fixtures). Real records never show it, even while loading. */
function SampleDataBanner() {
  const info = useAsync(getDatasetInfo, []);
  if (info.status !== 'ready' || !info.data.containsMock) return null;
  return (
    <div className="data-banner" role="note">
      <strong>Sample data.</strong>{' '}
      <span>
        {info.data.mockRecords < info.data.totalRecords
          ? `${info.data.mockRecords} of ${info.data.totalRecords} records shown are fictional test content`
          : 'Records shown are fictional test content'}
        , not official government records.
      </span>
    </div>
  );
}
