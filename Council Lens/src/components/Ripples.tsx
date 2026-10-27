import { CompassMark } from './CompassMark';

/** Decorative rings, like the ripple around a map pin: "this is about where you live". */
export function Ripples() {
  return (
    <div className="ripples" aria-hidden="true">
      <span className="ripples__ring" />
      <span className="ripples__ring" />
      <span className="ripples__ring" />
      <span className="ripples__dot">
        <CompassMark />
      </span>
    </div>
  );
}
