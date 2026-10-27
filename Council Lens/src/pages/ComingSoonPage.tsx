import { Link } from 'react-router-dom';
import {
  availableCounties,
  chooserPath,
  countiesOf,
  countyNames,
  countyPath,
  municipalitiesInCounty,
  type County,
  type Jurisdiction,
  type Municipality,
} from '../services/jurisdictions';
import { usePageTitle } from '../services/usePageTitle';
import { Ripples } from '../components/Ripples';

const joinNames = (names: string[]) =>
  names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;

/**
 * Shown for every city, and for every county without civic records. It never loads or
 * shows civic records; it only uses the location directory.
 */
export function ComingSoon({ place }: { place: Jurisdiction }) {
  usePageTitle(`${place.name}: coming soon`);
  const covered = availableCounties();
  // For a city, prefer the covered county it is in (Roswell → Fulton County).
  const home = place.level === 'municipality' ? (countiesOf(place).find((c) => c.civicDataAvailable) ?? null) : null;
  const explore = home ?? covered[0];
  const ownRecords = home?.recordSources.find((s) => s.name === `City of ${place.name}`);
  const where = place.level === 'county' ? 'County in Georgia' : `${capitalize(place.kind)} in ${countyNames(countiesOf(place))}, Georgia`;

  return (
    <div className="page">
      <section className="soon" aria-labelledby="soon-title">
        <Ripples />
        <div className="soon__inner">
          <div className="soon__main">
            <p className="soon__badge">
              <ClockIcon /> Coming soon
            </p>
            <p className="soon__where">{where}</p>
            <h1 id="soon-title" className="soon__title">
              {place.name} is coming soon.
            </h1>
            <p className="soon__lede">
              Council Lens is designed to be adapted to other counties. Current county coverage: {joinNames(covered.map((c) => c.name)) || 'none yet'}.
              {' '}Each new location needs its own connected and checked records.
            </p>
            {home && (
              <p className="soon__detail">
                {ownRecords
                  ? `Records from the ${ownRecords.name} are on the ${home.name} page for now.`
                  : `${place.level === 'municipality' && place.countyIds.length > 1 ? 'Part of ' : ''}${place.name} is in ${home.name}, which has its own page.`}
              </p>
            )}
            <div className="soon__actions">
              {explore && (
                <Link to={countyPath(explore)} className="soon__primary">
                  Explore {explore.name}
                </Link>
              )}
              <Link to={chooserPath(place)} className="soon__secondary">
                Change location
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* A city's county is already named above, with its own "Explore" action, so only counties list their places. */}
      {place.level === 'county' && <CountyPlaces county={place} cities={municipalitiesInCounty(place.id)} />}

      {!ownRecords && (
        <p className="soon__why fine-print">
          Council Lens only shows records that have been checked against official sources. None have been added for {place.name} yet, so this page
          shows no issues, meetings, or documents.
        </p>
      )}
    </div>
  );
}

function CountyPlaces({ county, cities }: { county: County; cities: Municipality[] }) {
  return (
    <section className="soon-more" aria-labelledby="soon-cities-h">
      <h2 id="soon-cities-h" className="soon-more__title">
        Cities and towns in {county.name}
      </h2>
      {cities.length ? (
        <>
        <p className="soon-more__note">
          None of these {cities.length === 1 ? 'place has' : `${cities.length} places have`} records yet. Each has a location page; civic records need a separate integration.
        </p>
        <ul className="soon-places">
          {cities.map((m) => (
            <li key={m.id}>
              <Link to={`/${m.id}`} className="soon-place">
                <span className="soon-place__name">{m.name}</span> <span className="soon-place__status visually-hidden">Coming soon</span>
              </Link>
            </li>
          ))}
        </ul>
        </>
      ) : (
        <p className="muted">Our directory has no incorporated cities or towns listed for {county.name}.</p>
      )}
    </section>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
