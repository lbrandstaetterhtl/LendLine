import { useBranding } from "../branding/BrandingContext";

/**
 * LendLine mark "Rücklauf-Schleife": an L drawn as one line whose foot loops back as an arrow (a
 * device goes out and comes back). Geometry on a 32 × 32 grid, see doc/LendLine.md.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  // Below 20 px the arrowhead turns to mush, so small sizes drop it and use a heavier stroke.
  const small = size < 20;
  const glyph = Math.round(size * 0.75);
  return (
    <span
      className="logo"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.25) }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        width={glyph}
        height={glyph}
        fill="none"
        stroke="currentColor"
        strokeWidth={small ? 4.5 : 3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 6 V19 a5 5 0 0 0 5 5 H21" />
        <path
          d={
            small
              ? "M21 24 a4 4 0 0 0 0 -8 H17"
              : "M21 24 a4 4 0 0 0 0 -8 H17 M19.5 13.5 L17 16 L19.5 18.5"
          }
        />
      </svg>
    </span>
  );
}

/**
 * "LendLine" with a strong "Lend" and a lighter "Line".
 */
export function Wordmark() {
  return (
    <span className="wordmark">
      <span>Lend</span>
      <span>Line</span>
    </span>
  );
}

/**
 * The company logo when one is uploaded (with its dark-mode variant, if any), else the LendLine
 * mark and wordmark. `height` is the logo height in px.
 */
export function BrandLogo({ height }: { height: number }) {
  const { branding } = useBranding();
  if (!branding.logoUrl) {
    return (
      <>
        <LogoMark size={height} />
        <Wordmark />
      </>
    );
  }
  return (
    <span className={`brand-logo${branding.logoDarkUrl ? " has-dark" : ""}`}>
      <img
        className="brand-logo-light"
        src={branding.logoUrl}
        alt="Firmenlogo"
        style={{ maxHeight: height }}
      />
      {branding.logoDarkUrl && (
        <img
          className="brand-logo-dark"
          src={branding.logoDarkUrl}
          alt="Firmenlogo"
          style={{ maxHeight: height }}
        />
      )}
    </span>
  );
}
