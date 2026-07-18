import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Game Guide Guru",
    short_name: "Game Guide",
    description:
      "Tell it where you are stuck in a game and get a clear, sourced guide.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#00FFAA",
    theme_color: "#00FFAA",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
