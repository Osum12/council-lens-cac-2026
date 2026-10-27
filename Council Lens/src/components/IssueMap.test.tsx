import { render } from '@testing-library/react';
import { IssueMap, type MapPoint } from './IssueMap';

// Uses the real Leaflet library in jsdom to check marker accessibility and that
// selection restyles markers in place rather than rebuilding them (which would drop focus).
const points: MapPoint[] = [
  { id: 'a', title: 'First issue', number: 1, coords: { latitude: 34.07, longitude: -84.29 }, note: 'approximate map point' },
  { id: 'b', title: 'Second issue', number: 2, coords: { latitude: 34.08, longitude: -84.3 }, note: null },
];

describe('IssueMap', () => {
  it('gives every marker a descriptive accessible name and pressed state', () => {
    const { container } = render(<IssueMap points={points} origin={null} selectedId={null} onSelect={() => {}} />);
    const pins = container.querySelectorAll('.leaflet-marker-icon[role="button"]');
    expect(pins).toHaveLength(2);
    expect(pins[0]).toHaveAttribute('aria-label', 'Map pin 1: First issue (approximate map point)');
    expect(pins[1]).toHaveAttribute('aria-label', 'Map pin 2: Second issue');
    expect(pins[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps marker elements (and focus) when the selection changes', () => {
    const { container, rerender } = render(<IssueMap points={points} origin={null} selectedId={null} onSelect={() => {}} />);
    const before = container.querySelector('[aria-label^="Map pin 2"]') as HTMLElement;
    before.focus();
    rerender(<IssueMap points={points} origin={null} selectedId="b" onSelect={() => {}} />);
    const after = container.querySelector('[aria-label^="Map pin 2"]') as HTMLElement;
    expect(after).toBe(before);
    expect(after).toHaveAttribute('aria-pressed', 'true');
    expect(after.querySelector('.pin--selected')).not.toBeNull();
    expect(document.activeElement).toBe(after);
  });

  it('selects a marker with the keyboard', () => {
    const onSelect = vi.fn();
    const { container } = render(<IssueMap points={points} origin={null} selectedId={null} onSelect={onSelect} />);
    const pin = container.querySelector('[aria-label^="Map pin 1"]') as HTMLElement;
    pin.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('explains when nothing can be mapped', () => {
    const { getByText } = render(<IssueMap points={[]} origin={null} selectedId={null} onSelect={() => {}} />);
    expect(getByText('None of the listed issues has map coordinates.')).toBeInTheDocument();
  });
});
