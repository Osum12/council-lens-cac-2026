import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { setDataLoader } from '../services/civicData';
import { splitMeetings } from './CitywidePage';
import type { MapPoint } from '../components/IssueMap';
import type { Meeting } from '../types/civic';
import { mockLoader } from '../test/mockDataset';

// Leaflet needs a real browser layout engine; replace the map with a simple list of its markers.
vi.mock('../components/IssueMap', () => ({
  IssueMap: ({ points, onSelect }: { points: MapPoint[]; onSelect: (id: string) => void }) => (
    <ul aria-label="map markers">
      {points.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onSelect(p.id)}>
            marker {p.number}: {p.title}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

// Tests run against the fictional fixture pack, not the real records in /data.
beforeEach(() => setDataLoader(mockLoader));
afterEach(() => setDataLoader(null));

describe('Citywide', () => {
  it('shows the sample-data banner, featured issues, and meetings from the service', async () => {
    renderAt('/county/fulton');
    expect(await screen.findByText('Sample data.')).toBeInTheDocument();
    const issues = screen.getByRole('heading', { name: 'Issues' }).closest('section')!;
    expect(within(issues).getByRole('link', { name: /^MOCK ONLY: Sample Pedestrian Crossing Review$/ })).toHaveAttribute('href', '/county/fulton/issues/issue-mock-001');
    expect(screen.getAllByText('Sample data').length).toBeGreaterThan(3);
    const meetings = screen.getByRole('heading', { name: 'Meetings' }).closest('aside')!;
    expect(within(meetings).getByRole('link', { name: /Sample Transportation Update/ })).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    let fail = true;
    setDataLoader(async () => {
      if (fail) throw new Error('offline');
      return { meetings: [], issues: [], documents: [] };
    });
    renderAt('/county/fulton');
    expect(await screen.findByText(/couldn’t load these records/i)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No civic records are loaded yet/)).toBeInTheDocument();
  });

  it('splits upcoming and past meetings', () => {
    const m = (id: string, date: string | null, status: string) => ({ id, date, status }) as Meeting;
    const { upcoming, recent } = splitMeetings([m('a', '2026-10-01', 'completed'), m('b', '2026-11-01', 'scheduled'), m('c', '2026-12-01', 'canceled')], '2026-10-21');
    expect(upcoming.map((x) => x.id)).toEqual(['b']);
    expect(recent.map((x) => x.id)).toEqual(['c', 'a']);
  });

  it('does not list a "scheduled" meeting whose date has passed as upcoming', () => {
    const m = (id: string, date: string | null, status: string) => ({ id, date, status }) as Meeting;
    const { upcoming, recent } = splitMeetings([m('old', '2026-10-27', 'scheduled'), m('tbd', null, 'scheduled')], '2026-11-01');
    expect(upcoming.map((x) => x.id)).toEqual(['tbd']);
    expect(recent.map((x) => x.id)).toEqual(['old']);
  });
});

describe('Issue detail', () => {
  it('shows status, related meeting and documents, and no fake source links', async () => {
    renderAt('/issues/issue-mock-001');
    expect(await screen.findByRole('heading', { level: 1, name: /Pedestrian Crossing Review/ })).toBeInTheDocument();
    expect(screen.getByText('Under consideration')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sample City Council Meeting/ })).toHaveAttribute('href', '/county/fulton/meetings/meeting-mock-001');
    expect(screen.getByRole('link', { name: /Sample Council Agenda Packet/ })).toHaveAttribute('href', '/county/fulton/documents/document-mock-001');
    expect(screen.getByText(/No official source has been added/)).toBeInTheDocument();
    expect(document.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
  });

  it('handles an issue with no location and unknown status', async () => {
    renderAt('/issues/issue-mock-004');
    expect(await screen.findByText('Status not verified')).toBeInTheDocument();
    expect(screen.getByText(/No location is recorded/)).toBeInTheDocument();
  });

  it('shows a not-found page for an unknown ID', async () => {
    renderAt('/issues/nope');
    expect(await screen.findByRole('heading', { name: 'Issue not found' })).toBeInTheDocument();
  });
});

describe('Archive and meeting detail', () => {
  it('filters by record type', async () => {
    renderAt('/archive');
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(8); // 3 meetings + 5 documents

    await userEvent.click(screen.getByRole('button', { name: /^Agendas/ }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Agendas/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: /^Documents/ }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(4);

    await userEvent.click(screen.getByRole('button', { name: /^Videos/ }));
    expect(screen.getByText(/No meeting recordings are linked/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all records' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8);
  });

  it('shows meeting documents and issues, with unavailable links as plain text', async () => {
    renderAt('/meetings/meeting-mock-002');
    expect(await screen.findByRole('heading', { level: 1, name: /Planning Commission/ })).toBeInTheDocument();
    expect(screen.getByText('Recording not available')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Watch the recording/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sample Planning Staff Report/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^MOCK ONLY: Sample Land-Use Application$/ })).toHaveAttribute('href', '/county/fulton/issues/issue-mock-003');
  });

  it('shows a document with its meeting and related issues', async () => {
    renderAt('/documents/document-mock-005');
    expect(await screen.findByText('No file is linked for this record')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sample City Council Meeting/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^MOCK ONLY: Sample Public-Space Improvement Proposal$/ })).toBeInTheDocument();
  });
});

describe('Near Me', () => {
  it('lists every issue, maps only those with coordinates, and sorts from a public starting point', async () => {
    renderAt('/near-me');
    const markers = await screen.findByRole('list', { name: 'map markers' });
    expect(within(markers).getAllByRole('listitem')).toHaveLength(4); // issue-mock-004 has no location
    // Pins are numbered 1..4 with no gaps, even though the unlocated issue sits mid-list.
    expect(within(markers).getAllByRole('button').map((b) => b.textContent?.match(/marker (\d)/)?.[1])).toEqual(['1', '2', '3', '4']);
    expect(screen.getByText(/no map location, so it is listed as a countywide item/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sorted by distance from Fulton County Government Center' })).toBeInTheDocument();
    expect(screen.getAllByText(/mi away in a straight line/).length).toBe(4);
  });

  it('syncs a marker selection with the feed', async () => {
    renderAt('/near-me');
    await userEvent.click(await screen.findByRole('button', { name: /marker \d: MOCK ONLY: Sample Road Corridor Study/ }));
    expect(screen.getByRole('button', { name: 'Highlighted on map' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('names its one public starting point and asks for no address', async () => {
    renderAt('/near-me');
    expect(await screen.findByText(/Distances are measured from/)).toHaveTextContent('Distances are measured from Fulton County Government Center, 141 Pryor Street SW, Atlanta.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('With the real curated records in /data', () => {
  beforeEach(() => setDataLoader(null));

  it('shows Fulton County records with no sample labels, each linked to its official record', async () => {
    renderAt('/county/fulton');
    expect((await screen.findAllByRole('link', { name: /^Transportation sales tax \(TSPLOST\) referendum$/ })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sample data|Alpharetta/)).not.toBeInTheDocument();
    // Long groups open with their first 6 issues and grow 24 at a time; a short group shows whole.
    expect(screen.getAllByRole('link', { name: /^Official record/ })).toHaveLength(26); // 8 pending + 6 approved + 6 denied + 6 withdrawn
    await userEvent.click(screen.getByRole('button', { name: /^Show 24 more approved issues/ }));
    expect(screen.getAllByRole('link', { name: /^Official record/ })).toHaveLength(50);
    // Every issue card links to the item's page on the county's own Legistar site (the site's
    // own link, read from its meeting pages), never a made-up URL.
    for (const a of screen.getAllByRole('link', { name: /^Official record/ }))
      expect(a.getAttribute('href')).toMatch(/^https:\/\/fulton\.legistar\.com\/LegislationDetail\.aspx\?ID=\d+&GUID=[\w-]+&G=197058BF-F352-4423-BE44-04DFABBD8188&Options=&Search=$/);
    expect(
      screen.getByText(/Agenda items from the board’s 51 meetings, January\s8,\s2025 to October\s21,\s2026\. Ceremonial items such as proclamations are left out\. Last checked against official county records on October\s24,\s2026\./),
    ).toBeInTheDocument();
    expect(screen.getAllByText('From the Fulton County Board of Commissioners')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What’s on the table in Fulton County');
    // Unfinished and failed items keep their real status.
    expect(screen.getAllByText('Under consideration').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Denied').length).toBeGreaterThanOrEqual(2);
    // Meeting cards link to their real agenda PDFs.
    expect(screen.getAllByRole('link', { name: /^Agenda \(PDF\)/ }).length).toBe(4);
  });

  it('keeps archive documents next to the meeting they belong to', async () => {
    renderAt('/archive');
    const rows = within(await screen.findByRole('list')).getAllByRole('listitem').map((li) => li.querySelector('h2')?.textContent ?? '');
    expect(rows).toHaveLength(40); // the newest 40 of 51 meetings and 4,098 documents; the rest come in steps
    expect(screen.getByRole('button', { name: /^Show 40 more records/ })).toBeInTheDocument();
    const meeting = rows.indexOf('Board of Commissioners Second Regular Meeting, October 21, 2026');
    const agenda = rows.indexOf('Board of Commissioners Agenda, October 21, 2026');
    expect(meeting).toBeGreaterThanOrEqual(0);
    expect(agenda - meeting).toBeGreaterThan(0);
    const dateLines = [...document.querySelectorAll('.archive-row__date')].map((p) => p.textContent);
    expect(dateLines).toContain('For the October 21, 2026 meeting.');
    await userEvent.click(screen.getByRole('button', { name: /^Videos/ }));
    expect(screen.getByRole('status')).toHaveTextContent('47 records');
    expect(screen.getAllByRole('link', { name: /^Watch recording/ })).toHaveLength(40);
  });

  it('shows a failed item as denied, with its official item record', async () => {
    renderAt('/issues/issue-26-0601-public-comment-policy');
    expect(await screen.findByText('Denied')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Item record on the county’s Legistar site/ }).getAttribute('href')).toMatch(/^https:\/\/fulton\.legistar\.com\/LegislationDetail\.aspx\?ID=/);
    expect(screen.getByText(/failed for lack of a second/)).toBeInTheDocument();
  });

  it('quotes the agenda’s own wording as a quote, never as a plain-language rewrite', async () => {
    renderAt('/issues/issue-26-0646');
    expect(await screen.findByRole('heading', { name: 'What happened' })).toBeInTheDocument();
    expect(screen.getByText(/^Approved October 7, 2026, 6–0\.$/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The agenda’s wording' })).toBeInTheDocument();
    expect(screen.getByText(/^Request approval to renew existing contracts - Department of Real Estate and Asset Management/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'In plain language' })).toBeNull();
    expect(screen.queryByText(/plain-language rewrite/)).toBeNull();
  });

  it('shows a plain-language summary, then the recorded result, for items explained from their documents', async () => {
    renderAt('/issues/issue-26-0214');
    expect(await screen.findByRole('heading', { name: 'In plain language' })).toBeInTheDocument();
    expect(screen.getByText(/South Fulton Municipal Regional Jail Authority/)).toBeInTheDocument();
    expect(screen.getByText(/^Approved April 15, 2026, 6–0\.$/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'The agenda’s wording' })).toBeNull();
  });

  it('puts approximate pins only on items with a street address from the county documents', async () => {
    renderAt('/near-me');
    const markers = await screen.findByRole('list', { name: 'map markers' });
    // Near Me shows the 20 nearest of the 125 mapped issues, and links to the full list.
    expect(within(markers).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByRole('link', { name: 'See all 1,303 issues on the Countywide page' })).toHaveAttribute('href', '/county/fulton');
  });

  it('filters Near Me by category, narrowing both the list and the pins', async () => {
    renderAt('/near-me');
    const select = await screen.findByLabelText('Category');
    expect(screen.getByRole('status')).toHaveTextContent('Nearest 20 of 1,303 issues, 20 on the map');
    await userEvent.selectOptions(select, 'housing_and_neighborhoods');
    expect(screen.getByRole('status')).toHaveTextContent('Nearest 20 of 37 issues in Housing and neighborhoods, 5 on the map');
    expect(within(screen.getByRole('list', { name: 'map markers' })).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('link', { name: 'Modernizing the jail’s elevators' })).toBeNull();
    await userEvent.selectOptions(select, '');
    expect(screen.getByRole('status')).toHaveTextContent('Nearest 20 of 1,303 issues, 20 on the map');
  });
});

describe('Citywide search, filters, and map links', () => {
  it('filters issues by keyword, topic and status, and can clear them', async () => {
    renderAt('/county/fulton');
    const search = await screen.findByLabelText('Search issues');
    await userEvent.type(search, 'corridor');
    expect(screen.getByText('1 of 5 issues match')).toBeInTheDocument();
    const issuesSection = screen.getByRole('heading', { name: 'Issues' }).closest('section')!;
    expect(within(issuesSection).getByRole('link', { name: /^MOCK ONLY: Sample Road Corridor Study$/ })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.selectOptions(screen.getByLabelText('Topic'), 'transportation');
    expect(screen.getByText('2 of 5 issues match')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'proposed');
    expect(screen.getByText('1 of 5 issues match')).toBeInTheDocument();

    await userEvent.type(search, 'nothing-matches-this');
    expect(screen.getByText('No issues match these filters.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('5 issues')).toBeInTheDocument();
    expect(screen.getByLabelText('Topic')).toHaveValue('');
  });

  it('offers map links only for issues with coordinates, pointing at the right selection', async () => {
    renderAt('/county/fulton');
    const mapLinks = await screen.findAllByRole('link', { name: /^View on map/ });
    expect(mapLinks).toHaveLength(4); // issue-mock-004 has no location
    expect(screen.getByRole('link', { name: 'View on map: MOCK ONLY: Sample Road Corridor Study' })).toHaveAttribute('href', '/county/fulton/near-me?issue=issue-mock-005');
  });

  it('has a hero search that jumps to the results', async () => {
    renderAt('/county/fulton');
    await userEvent.type(await screen.findByLabelText('Search issues'), 'corridor{Enter}');
    expect(screen.getByRole('heading', { name: 'Issues' })).toHaveFocus();
    expect(screen.getByText('1 of 5 issues match')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Shortcuts' })).toBeNull();
  });

  it('opens Near Me with the issue from the card already selected', async () => {
    renderAt('/near-me?issue=issue-mock-005');
    expect(await screen.findByRole('button', { name: 'Highlighted on map' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Issue detail timeline and archive search', () => {
  it('lists related meetings in date order', async () => {
    renderAt('/issues/issue-mock-001');
    const timeline = (await screen.findByRole('heading', { name: 'Timeline' })).closest('section')!;
    expect(within(timeline).getByRole('link', { name: /Sample City Council Meeting/ })).toHaveAttribute('href', '/county/fulton/meetings/meeting-mock-001');
    expect(screen.getByRole('link', { name: /All issues/ })).toHaveAttribute('href', '/county/fulton');
  });

  it('searches the archive and combines search with type filters', async () => {
    renderAt('/archive');
    await userEvent.type(await screen.findByLabelText('Search meetings and documents'), 'planning');
    expect(screen.getByText(/records? matching “planning”/)).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.textContent?.toLowerCase()).toContain('planning');
    await userEvent.type(screen.getByLabelText('Search meetings and documents'), ' zzz');
    expect(screen.getByText(/No records match/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all records' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8);
  });
});

describe('Hero panel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, 12));
  });
  afterEach(() => vi.useRealTimers());

  it('shows the latest decision, and no "next meeting" when none is scheduled', async () => {
    setDataLoader(null);
    renderAt('/county/fulton');
    const panel = await screen.findByRole('complementary', { name: 'Latest decision' });
    expect(within(panel).queryByText(/Next at/)).toBeNull();
    // The newest decision; on the same day, one with a plain-language explanation.
    expect(within(panel).getByRole('link', { name: 'Ending the HIV Epidemic spending increase for HIV care subrecipients' })).toHaveAttribute(
      'href',
      '/county/fulton/issues/issue-26-0703',
    );
    expect(within(panel).getByText(/October\s21,\s2026/)).toBeInTheDocument();
  });

  it('shows the next meeting and its agenda items when one is scheduled', async () => {
    renderAt('/county/fulton');
    const panel = await screen.findByRole('complementary', { name: 'Next at the Government Center' });
    expect(within(panel).getAllByRole('link', { name: /Sample/ }).length).toBeGreaterThan(0);
  });
});

describe('Review fixes', () => {
  it('ignores filter values in the URL that are not in the data', async () => {
    renderAt('/county/fulton?topic=bogus&status=denied');
    expect(await screen.findByText('5 issues')).toBeInTheDocument();
    expect(screen.getByLabelText('Topic')).toHaveValue('');
  });

  it('names the active type when search plus type finds nothing', async () => {
    renderAt('/archive?q=planning&type=videos');
    expect(await screen.findByText(/No videos match “planning”\. \d+ other records? match/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all types' }));
    expect(screen.getByLabelText('Search meetings and documents')).toHaveValue('planning');
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives repeated document links distinct accessible names', async () => {
    setDataLoader(null);
    renderAt('/issues/issue-26-0662-2026-property-tax-rates');
    const pdfLinks = await screen.findAllByRole('link', { name: /^Open PDF/ });
    const names = pdfLinks.map((a) => a.textContent);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('Old date-filter links', () => {
  it('ignores ?when= now that the date filters are gone', async () => {
    renderAt('/county/fulton?when=30d');
    expect(await screen.findByText('5 issues')).toBeInTheDocument();
    expect(screen.queryByLabelText('Updated')).toBeNull();
  });

  it('ignores ?when= in the Archive too', async () => {
    renderAt('/archive?when=upcoming');
    expect(within(await screen.findByRole('list')).getAllByRole('listitem')).toHaveLength(8);
    expect(screen.queryByLabelText('Date')).toBeNull();
  });
});

describe('Routing', () => {
  it('shows a not-found page for unknown pages inside a city', async () => {
    renderAt('/county/fulton/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('treats an unknown first segment as an unknown location, not a fallback city', async () => {
    renderAt('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Location not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a location' })).toHaveAttribute('href', '/');
  });
});

describe('Search boxes (audit H1)', () => {
  it('keeps every typed character and follows the URL', async () => {
    renderAt('/county/fulton');
    const box = await screen.findByRole('searchbox', { name: 'Search issues' });
    await userEvent.type(box, 'planning commission', { delay: null });
    expect(box).toHaveValue('planning commission');
  });

  it('empties the hero search box when filters are cleared', async () => {
    renderAt('/county/fulton?q=crossing');
    const box = await screen.findByRole('searchbox', { name: 'Search issues' });
    expect(box).toHaveValue('crossing');
    await userEvent.click(screen.getAllByRole('button', { name: /Clear/ })[0]);
    expect(box).toHaveValue('');
  });

  it('keeps every typed character in the archive search', async () => {
    renderAt('/county/fulton/archive');
    const box = await screen.findByRole('searchbox', { name: 'Search meetings and documents' });
    await userEvent.type(box, 'planning commission', { delay: null });
    expect(box).toHaveValue('planning commission');
  });
});
