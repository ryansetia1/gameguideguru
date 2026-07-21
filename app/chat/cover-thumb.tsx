import { steamAppIdFromCoverUrl } from "@/lib/steam.js";

export function CoverThumb({
  cover,
  name,
  className,
}: {
  cover: string;
  name: string;
  className?: string;
}) {
  const cls = `cover${className ? ` ${className}` : ""}`;
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={cover} alt={`${name || "Game"} cover`} />;
  }
  return (
    <span className={`${cls} cover-placeholder`} aria-hidden="true">
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

/** Display-only: Steam CDN cover shows "Steam" instead of stored "PC". */
export function displayPlatform(platform: string, coverUrl?: string | null): string {
  return steamAppIdFromCoverUrl(coverUrl ?? "") ? "Steam" : platform;
}
