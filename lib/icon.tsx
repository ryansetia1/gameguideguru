import { ImageResponse } from "next/og";

// The brand mark: a serif "G" on signal-green, matching the in-app .brand-mark.
// Shared by the favicon, apple-touch icon, and the manifest icon route so there
// is a single source of truth and no committed binary assets.
export function renderIcon(size: number, maskable = false): ImageResponse {
  // Maskable icons are cropped to a safe zone, so shrink the glyph a bit.
  const fontSize = Math.round(size * (maskable ? 0.5 : 0.66));
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#d8ff4f",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize,
            fontWeight: 700,
            color: "#263900",
            transform: "rotate(-4deg)",
          }}
        >
          G
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
