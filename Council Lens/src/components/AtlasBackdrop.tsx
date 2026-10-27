import { useEffect, useRef } from 'react';
import { CompassMark } from './CompassMark';

// A route down the right-hand margin, drawn in a 120 × 900 frame that stretches to the lane.
// It wanders like a road on a map but never crosses the content column.
const ROUTE =
  'M62 -10C96 70 30 130 52 210S104 330 70 410 18 520 46 600 98 720 66 800 40 860 58 910';

/**
 * The atlas linework behind a page, in two layers that drift at different speeds as you
 * scroll, and a route in the right-hand margin that draws itself from the top of the page to
 * the bottom with the compass mark riding its tip. Decorative only; it holds still when
 * reduced motion is asked for.
 */
export function AtlasBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const route = routeRef.current;
    const marker = markerRef.current;
    if (!el || !route || !marker) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('atlas-backdrop--still');
      return;
    }
    const length = route.getTotalLength?.() ?? 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, y / max));
      el.style.setProperty('--near-y', `${Math.round(-y * 0.32)}px`);
      el.style.setProperty('--near-x', `${Math.round(y * 0.06)}px`);
      el.style.setProperty('--far-y', `${Math.round(-y * 0.12)}px`);
      el.style.setProperty('--far-x', `${Math.round(-y * 0.03)}px`);
      if (length) {
        route.style.strokeDashoffset = String(length * (1 - progress));
        const tip = route.getPointAtLength(length * progress);
        marker.style.left = `${(tip.x / 120) * 100}%`;
        marker.style.top = `${(tip.y / 900) * 100}%`;
        marker.style.opacity = progress > 0.01 ? '1' : '0';
      }
    };
    if (length) route.style.strokeDasharray = String(length);
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="atlas-backdrop" aria-hidden="true">
      <div className="atlas-backdrop__far" />
      <div className="atlas-backdrop__near" />
      <div className="atlas-route">
        <svg viewBox="0 0 120 900" preserveAspectRatio="none" focusable="false">
          <path className="atlas-route__planned" d={ROUTE} />
          <path ref={routeRef} className="atlas-route__travelled" d={ROUTE} />
        </svg>
        <span ref={markerRef} className="atlas-route__marker">
          <CompassMark />
        </span>
      </div>
    </div>
  );
}
