import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { COUNTIES, countyPath, getCounty, getMunicipality, municipalitiesInCounty, type County, type Municipality } from '../services/jurisdictions';
import { PinIcon } from './PinIcon';

/** What the selection leads to, in words (read out by screen readers as it changes). */
function describe(county: County | null, city: Municipality | null): string {
  if (!county) return 'Choose a county to see its cities and towns.';
  if (city)
    return `${city.name} is coming soon.${county.civicDataAvailable ? ` Choose “All of ${county.name}” to see its issues, meetings, map, and archive.` : ''}`;
  return county.civicDataAvailable
    ? `All of ${county.name}: issues, meetings, a map, and an archive.`
    : `${county.name} is coming soon. There are no civic records for it yet.`;
}

type Selection = { county: string; city: string };
const selectionKey = (s: Selection) => `${s.county}|${s.city}`;

/**
 * County → city chooser. Native selects (keyboard type-ahead, screen-reader support, mobile
 * pickers) styled to match the app. The selection is mirrored in the URL (?county=&city=) so
 * refresh and back/forward keep it, and changing the county clears the city.
 * Records are shown per county ("All of Fulton County"); cities show Coming Soon for now.
 */
export function LocationSelector() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const countyRef = useRef<HTMLSelectElement>(null);
  const [error, setError] = useState<string | null>(null);

  // The selects keep their own state: URL updates arrive a moment later (as a React
  // transition), and a select bound straight to the URL would briefly snap back meanwhile.
  // The URL is followed when it changes to something this form didn't write (e.g. a link to "/").
  const fromUrl: Selection = { county: params.get('county') ?? '', city: params.get('city') ?? '' };
  const [state, setState] = useState({ sel: fromUrl, seenUrl: selectionKey(fromUrl), written: [] as string[] });
  if (selectionKey(fromUrl) !== state.seenUrl) {
    const ours = state.written.includes(selectionKey(fromUrl));
    setState({ sel: ours ? state.sel : fromUrl, seenUrl: selectionKey(fromUrl), written: ours ? state.written : [] });
  }

  const county = getCounty(state.sel.county);
  const cities = county ? municipalitiesInCounty(county.id) : [];
  const requested = getMunicipality(state.sel.city);
  // A city is only honored together with a county it is actually in.
  const city = requested && county && requested.countyIds.includes(county.id) ? requested : null;

  const select = (countyId: string, cityId = '') => {
    const sel = { county: countyId, city: cityId };
    setState((s) => ({ ...s, sel, written: [...s.written, selectionKey(sel)] }));
    const p = new URLSearchParams();
    if (countyId) p.set('county', countyId);
    if (cityId) p.set('city', cityId);
    setParams(p, { replace: true });
    setError(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (city) navigate(`/${city.id}`);
    else if (county) navigate(countyPath(county));
    else {
      setError('Choose a county first.');
      countyRef.current?.focus();
    }
  };

  // How the status line reads: an error, nothing chosen yet, a place with records, or one coming soon.
  const tone = error ? 'error' : !county ? 'idle' : county.civicDataAvailable && !city ? 'ready' : 'soon';

  return (
    <form className="chooser" aria-labelledby="chooser-title" onSubmit={onSubmit} noValidate>
      <hgroup className="chooser__head">
        <h2 id="chooser-title" className="chooser__title">
          Find your community
        </h2>
        <p className="chooser__intro">Select a county and, optionally, a city to explore local government activity.</p>
      </hgroup>
      <div className="chooser__field chooser__field--county">
        <label htmlFor="county-select">County</label>
        <div className="chooser__control">
          <PinIcon className="chooser__icon" />
          <select
            id="county-select"
            ref={countyRef}
            value={county?.id ?? ''}
            onChange={(e) => select(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'chooser-status' : undefined}
          >
            <option value="">Select a county</option>
            {COUNTIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="chooser__field chooser__field--city">
        <label htmlFor="city-select">
          City or town <span className="chooser__optional">(optional)</span>
        </label>
        <div className="chooser__control">
          <select id="city-select" value={city?.id ?? ''} onChange={(e) => select(county?.id ?? '', e.target.value)} disabled={!county}>
            <option value="">{county ? `All of ${county.name}` : 'Select a county first'}</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p id="chooser-status" className={`chooser__status chooser__status--${tone}`} role="status" aria-live="polite">
        {error ?? describe(county, city)}
      </p>
      <button type="submit" className="chooser__go">
        Explore my community
        <span className="chooser__arrow" aria-hidden="true">
          →
        </span>
      </button>
    </form>
  );
}
