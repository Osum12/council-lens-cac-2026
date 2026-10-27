import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppRoutes } from '../App';
import { setDataLoader } from '../services/civicData';
import { mockLoader } from '../test/mockDataset';
import type { MapPoint } from '../components/IssueMap';

vi.mock('../components/IssueMap', () => ({
  IssueMap: ({ points }: { points: MapPoint[] }) => <ul aria-label="map markers">{points.map((p) => <li key={p.id}>{p.title}</li>)}</ul>,
}));

/** Shows the current URL and offers browser-style Back, so tests can check routing. */
function Probe() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="url">{pathname + search}</p>
      <button type="button" onClick={() => navigate(-1)}>
        browser back
      </button>
    </div>
  );
}

const renderAt = (...entries: string[]) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <AppRoutes />
      <Probe />
    </MemoryRouter>,
  );
const url = () => screen.getByTestId('url').textContent;

// Count every request for civic records, so tests can prove other places never load them.
let loads = 0;
beforeEach(() => {
  loads = 0;
  setDataLoader(() => {
    loads += 1;
    return mockLoader();
  });
});
afterEach(() => setDataLoader(null));

const county = () => screen.getByLabelText('County') as HTMLSelectElement;
const city = () => screen.getByLabelText(/City or town/) as HTMLSelectElement;
const explore = () => userEvent.click(screen.getByRole('button', { name: /Explore my community/ }));
const countyHeading = /What’s on the table/;

describe('Location chooser', () => {
  it('lists all 159 counties alphabetically and keeps the city list closed until a county is chosen', () => {
    renderAt('/');
    const options = within(county()).getAllByRole('option');
    expect(options).toHaveLength(160); // placeholder + 159
    expect(options[1]).toHaveTextContent('Appling County');
    expect(options[159]).toHaveTextContent('Worth County');
    expect(city()).toBeDisabled();
    expect(screen.queryByText(/Currently available|Available now/)).toBeNull();
    expect(screen.getByText(/Fulton County is the current working example/)).toHaveTextContent('designed to be adapted to other counties');
    expect(loads).toBe(0);
  });


  it('fills the city list from the chosen county, with "All of" the county first', async () => {
    renderAt('/');
    await userEvent.selectOptions(county(), 'fulton');
    expect(city()).toBeEnabled();
    const names = within(city()).getAllByRole('option').map((o) => o.textContent);
    expect(names[0]).toBe('All of Fulton County');
    expect(names).toHaveLength(16); // 15 Fulton cities and towns
    expect(names).toEqual(expect.arrayContaining(['Alpharetta', 'Atlanta', 'Roswell', 'Sandy Springs']));
    expect(names).not.toContain('Marietta'); // Cobb County only
    expect(screen.getByRole('status')).toHaveTextContent('All of Fulton County: issues, meetings, a map, and an archive.');
    expect(url()).toBe('/?county=fulton');
  });

  it('opens the Fulton County page for "All of Fulton County"', async () => {
    renderAt('/');
    await userEvent.selectOptions(county(), 'fulton');
    await explore();
    expect(await screen.findByRole('heading', { level: 1, name: countyHeading })).toHaveTextContent('in Fulton County');
    expect(url()).toBe('/county/fulton');
    expect(loads).toBeGreaterThan(0);
  });

  it('shows Coming Soon for a Fulton city, pointing to the Fulton County page', async () => {
    renderAt('/');
    await userEvent.selectOptions(county(), 'fulton');
    await userEvent.selectOptions(city(), 'alpharetta');
    expect(screen.getByRole('status')).toHaveTextContent('Alpharetta is coming soon. Choose “All of Fulton County”');
    await explore();
    expect(screen.getByRole('heading', { level: 1, name: 'Alpharetta is coming soon.' })).toBeInTheDocument();
    expect(screen.getByText('Alpharetta is in Fulton County, which has its own page.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore Fulton County' })).toHaveAttribute('href', '/county/fulton');
    expect(url()).toBe('/alpharetta');
    expect(loads).toBe(0);
  });

  it('shows Coming Soon for a city in two counties, without loading records', async () => {
    renderAt('/?county=fulton&city=roswell');
    await explore();
    expect(screen.getByRole('heading', { level: 1, name: 'Roswell is coming soon.' })).toBeInTheDocument();
    expect(screen.getByText('City in Cobb and Fulton counties, Georgia')).toBeInTheDocument();
    expect(screen.getByText('Part of Roswell is in Fulton County, which has its own page.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Change location' })) expect(link).toHaveAttribute('href', '/?county=fulton&city=roswell');
    expect(loads).toBe(0);
  });

  it('shows a county Coming Soon page for any other county', async () => {
    renderAt('/');
    await userEvent.selectOptions(county(), 'cobb');
    expect(screen.getByRole('status')).toHaveTextContent('Cobb County is coming soon.');
    await explore();
    expect(screen.getByRole('heading', { level: 1, name: 'Cobb County is coming soon.' })).toBeInTheDocument();
    expect(screen.getByText(/Current county coverage:/)).toHaveTextContent('Current county coverage: Fulton County');
    const list = screen.getByRole('heading', { name: 'Cities and towns in Cobb County' }).closest('section')!;
    expect(within(list).getByRole('link', { name: 'Marietta Coming soon' })).toHaveAttribute('href', '/marietta');
    expect(screen.getByRole('link', { name: 'Explore Fulton County' })).toHaveAttribute('href', '/county/fulton');
    expect(url()).toBe('/county/cobb');
    expect(loads).toBe(0);
  });

  it('asks for a county instead of guessing one', async () => {
    renderAt('/');
    await explore();
    expect(screen.getByRole('status')).toHaveTextContent('Choose a county first.');
    expect(county()).toHaveFocus();
    expect(county()).toHaveAttribute('aria-invalid', 'true');
    expect(url()).toBe('/');
  });

  it('clears the city when the county changes', async () => {
    renderAt('/?county=fulton&city=alpharetta');
    expect(city().value).toBe('alpharetta');
    await userEvent.selectOptions(county(), 'cobb');
    expect(city().value).toBe('');
    expect(url()).toBe('/?county=cobb');
  });

  it('follows the URL when it changes from outside the form (the Council Lens home link)', async () => {
    renderAt('/?county=fulton&city=alpharetta');
    await userEvent.selectOptions(county(), 'cobb');
    await userEvent.click(screen.getByRole('link', { name: 'Council Lens, choose a location' }));
    expect(url()).toBe('/');
    expect(county().value).toBe('');
    expect(city()).toBeDisabled();
  });

  it('ignores invalid or mismatched selections in the URL', () => {
    renderAt('/?county=narnia&city=alpharetta');
    expect(county().value).toBe('');
    expect(city()).toBeDisabled();
  });

  it('does not accept a city through a county it is not in', () => {
    renderAt('/?county=cobb&city=alpharetta');
    expect(county().value).toBe('cobb');
    expect(city().value).toBe('');
  });
});

describe('Current example coverage: no records outside the connected Fulton County page', () => {
  const elsewhere = [
    '/',
    '/?county=fulton',
    '/county/cobb',
    '/county/cobb/archive?q=council&type=videos',
    '/county/cobb/issues/issue-mock-001',
    '/alpharetta',
    '/alpharetta/archive?q=council',
    '/roswell/near-me?issue=issue-mock-001',
    '/roswell/meetings/meeting-mock-001',
    '/johns-creek/documents/document-mock-001',
  ];
  it.each(elsewhere)('%s shows no records and never loads them', (path) => {
    renderAt(path);
    expect(screen.queryByText(/MOCK ONLY|Sample/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'map markers' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(loads).toBe(0);
  });

  it('shows Coming Soon on every page of a city, keeping the place visible', () => {
    renderAt('/roswell/archive?q=council');
    expect(screen.getByRole('heading', { level: 1, name: 'Roswell is coming soon.' })).toBeInTheDocument();
    expect(screen.getByText('Roswell, Cobb and Fulton counties')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /pages/ })).toBeNull();
    expect(document.title).toBe('Roswell: coming soon · Council Lens');
  });
});

describe('Routing', () => {
  it('opens Fulton County deep links directly and scopes their navigation', async () => {
    renderAt('/county/fulton/issues/issue-mock-001');
    expect(await screen.findByRole('heading', { level: 1, name: /Pedestrian Crossing Review/ })).toBeInTheDocument();
    expect(screen.getByText('Fulton County, Georgia')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Fulton County pages' });
    expect(within(nav).getByRole('link', { name: 'Countywide' })).toHaveAttribute('href', '/county/fulton');
    expect(within(nav).getByRole('link', { name: 'Archive' })).toHaveAttribute('href', '/county/fulton/archive');
    expect(screen.getByRole('link', { name: 'Change location' })).toHaveAttribute('href', '/?county=fulton');
  });

  it.each([
    ['/archive?type=videos', '/county/fulton/archive?type=videos'],
    ['/near-me?issue=issue-mock-005', '/county/fulton/near-me?issue=issue-mock-005'],
    ['/issues/issue-mock-001', '/county/fulton/issues/issue-mock-001'],
    ['/meetings/meeting-mock-001', '/county/fulton/meetings/meeting-mock-001'],
    ['/documents/document-mock-001', '/county/fulton/documents/document-mock-001'],
    ['/?topic=transportation&q=road', '/county/fulton?topic=transportation&q=road'],
  ])('redirects the original link %s to %s', (from, to) => {
    renderAt(from);
    expect(url()).toBe(to);
  });

  it('accepts a county link in any letter case', async () => {
    renderAt('/county/Fulton');
    expect(await screen.findByRole('heading', { level: 1, name: countyHeading })).toBeInTheDocument();
  });

  it('keeps search and filters working on the Fulton County page', async () => {
    renderAt('/county/fulton?q=crossing');
    expect(await screen.findByText(/^1 of \d+ issues match$/)).toBeInTheDocument();
    expect(document.title).toBe('Countywide · Fulton County · Council Lens');
  });

  it('empties a search box when the URL is reset by a nav link', async () => {
    renderAt('/county/fulton/archive');
    const box = await screen.findByRole('searchbox', { name: 'Search meetings and documents' });
    await userEvent.type(box, 'minutes council');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Fulton County pages' })).getByRole('link', { name: 'Archive' }));
    expect(url()).toBe('/county/fulton/archive');
    expect(box).toHaveValue('');
  });

  it('handles unknown places as unknown locations', () => {
    renderAt('/county/narnia');
    expect(screen.getByRole('heading', { name: 'Location not found' })).toBeInTheDocument();
    expect(loads).toBe(0);
  });

  it('returns to the chooser with the selection intact on Back', async () => {
    renderAt('/?county=fulton');
    await explore();
    expect(await screen.findByRole('heading', { level: 1, name: countyHeading })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'browser back' }));
    expect(url()).toBe('/?county=fulton');
    expect(county().value).toBe('fulton');
  });

  it('moves between places with Back and Forward without mixing their content', async () => {
    renderAt('/county/fulton', '/roswell');
    expect(screen.getByRole('heading', { level: 1, name: 'Roswell is coming soon.' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'browser back' }));
    expect(await screen.findByRole('heading', { level: 1, name: countyHeading })).toBeInTheDocument();
    expect(screen.queryByText('Roswell is coming soon.')).toBeNull();
  });
});
