import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { setDataLoader } from '../services/civicData';
import { monthWeeks, shiftMonth, shortMeetingTitle } from './CalendarPage';
import { mockLoader } from '../test/mockDataset';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('calendar helpers', () => {
  it('lays a month out in Sunday-first weeks', () => {
    const weeks = monthWeeks('2026-10'); // October 1, 2026 is a Thursday
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks[4]).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(monthWeeks('2026-02').flat().filter(Boolean)).toHaveLength(28);
  });

  it('moves between months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });

  it('shortens board meeting titles for the grid', () => {
    expect(shortMeetingTitle('Board of Commissioners Second Regular Meeting, October 21, 2026')).toBe('Second Regular Meeting');
    expect(shortMeetingTitle('Board of Commissioners Special Called Meeting (property tax hearing), July 9, 2025')).toBe('Special Called Meeting (property tax hearing)');
    expect(shortMeetingTitle('MOCK ONLY: Sample City Council Meeting')).toBe('MOCK ONLY: Sample City Council Meeting');
  });
});

describe('Calendar page', () => {
  beforeEach(() => setDataLoader(mockLoader));
  afterEach(() => setDataLoader(null));

  it('is a section of the county nav', async () => {
    renderAt('/county/fulton/calendar?month=2026-10');
    const nav = await screen.findByRole('navigation', { name: 'Fulton County pages' });
    expect(within(nav).getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts each meeting on its day, linked to the meeting page, and lists them below', async () => {
    renderAt('/county/fulton/calendar?month=2026-10');
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    const grid = screen.getByRole('table', { name: 'Board meetings in October 2026' });
    const day12 = within(grid).getByText('12').closest('td')!;
    expect(within(day12).getByRole('link', { name: /7:00 PM.*Sample City Council Meeting/ })).toHaveAttribute('href', '/county/fulton/meetings/meeting-mock-001');
    expect(within(grid).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: '3 meetings in October 2026' })).toBeInTheDocument();
    // The first month with meetings has no earlier month to go to.
    expect(screen.getByRole('button', { name: /^Previous month/ })).toBeDisabled();
  });

  it('jumps to a month and follows old links', async () => {
    renderAt('/calendar?month=2026-10');
    const jump = await screen.findByLabelText('Jump to a month with meetings');
    expect(jump).toHaveValue('2026-10');
    expect(within(jump).getByRole('option', { name: 'October 2026 (3 meetings)' })).toBeInTheDocument();
  });
});

describe('Calendar with the real records', () => {
  beforeEach(() => setDataLoader(null));

  it('shows two meetings on one day and steps between months', async () => {
    renderAt('/county/fulton/calendar?month=2025-07');
    const grid = await screen.findByRole('table', { name: 'Board meetings in July 2025' });
    const day9 = within(grid).getByText('9').closest('td')!;
    expect(within(day9).getAllByRole('link').map((a) => a.textContent)).toEqual(['10:00 AMFirst Regular Meeting', '6:00 PMSpecial Called Meeting']);
    await userEvent.click(screen.getByRole('button', { name: 'Next month, August 2025' }));
    expect(screen.getByRole('heading', { name: 'August 2025' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3 meetings in August 2025' })).toBeInTheDocument();
  });
});
