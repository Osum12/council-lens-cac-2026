// Home hero artwork: a lens held over a plain graticule. Inside the glass the grid is drawn
// larger, as if magnified. The grid is abstract; it is not a map of any real streets.
const C = 300; // centre of the 600 × 600 drawing
const RIM = 196; // the glass
const BEZEL = 236; // the graduated ring around it

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)].map((v) => +v.toFixed(2));
};
const grid = (step: number, from: number, to: number) => {
  const lines: string[] = [];
  for (let v = from; v <= to; v += step) lines.push(`M${v} ${from}V${to}M${from} ${v}H${to}`);
  return lines.join('');
};
const OUTSIDE = grid(30, 0, 600);
// The magnified grid keeps a line through the centre so the crosshair sits on it.
const INSIDE = grid(48, C - 48 * 5, C + 48 * 5);
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const major = i % 6 === 0;
  const [x1, y1] = polar(BEZEL, i * 5);
  const [x2, y2] = polar(BEZEL + (major ? 14 : 6), i * 5);
  return `M${x1} ${y1}L${x2} ${y2}`;
});
const BEARING = -38; // degrees from north: where the marked place sits in the glass
const [px, py] = polar(150, BEARING);
const [bx, by] = polar(RIM, BEARING);

export function LensArtwork() {
  return (
    <div className="lens-art" aria-hidden="true">
      <svg className="lens-art__svg" viewBox="0 0 600 600" focusable="false">
        <defs>
          <radialGradient id="lens-art-fade">
            <stop offset="0.55" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="lens-art-outside">
            <rect width="600" height="600" fill="url(#lens-art-fade)" />
            <circle cx={C} cy={C} r={RIM} fill="#000" />
          </mask>
          <clipPath id="lens-art-glass">
            <circle cx={C} cy={C} r={RIM} />
          </clipPath>
        </defs>
        <g fill="none" stroke="currentColor">
          <path className="lens-art__grid" d={OUTSIDE} strokeOpacity="0.1" mask="url(#lens-art-outside)" />
          <g className="lens-art__grid" clipPath="url(#lens-art-glass)">
            <circle cx={C} cy={C} r={RIM} fill="currentColor" fillOpacity="0.035" stroke="none" />
            <path d={INSIDE} strokeOpacity="0.17" />
          </g>
          <circle cx={C} cy={C} r={BEZEL} strokeOpacity="0.2" />
          <path d={TICKS.filter((_, i) => i % 6 !== 0).join('')} strokeOpacity="0.22" />
          <path d={TICKS.filter((_, i) => i % 6 === 0).join('')} strokeOpacity="0.42" />
          <circle cx={C} cy={C} r={RIM} strokeOpacity="0.42" strokeWidth="1.25" />
          <circle cx={C} cy={C} r="124" strokeOpacity="0.3" strokeDasharray="2 6" />
          <path d={`M${C} ${C - 112}V${C - 22}M${C} ${C + 22}V${C + 112}M${C - 112} ${C}H${C - 22}M${C + 22} ${C}H${C + 112}`} strokeOpacity="0.28" />
          <path d={`M${C} ${C}L${bx} ${by}`} strokeOpacity="0.4" strokeDasharray="3 5" />
          <circle cx={px} cy={py} r="11" strokeOpacity="0.5" />
          <circle cx={C} cy={C} r="16" strokeOpacity="0.45" />
        </g>
        <g fill="currentColor">
          <path d={`M${C} ${C - BEZEL - 30}l6 12h-12z`} fillOpacity="0.6" />
          <circle cx={px} cy={py} r="4.5" />
          <path
            transform={`translate(${C - 18} ${C - 18}) scale(1.5)`}
            d="M12 1.5 13.9 10.1 22.5 12 13.9 13.9 12 22.5 10.1 13.9 1.5 12 10.1 10.1Z"
          />
        </g>
      </svg>
    </div>
  );
}
