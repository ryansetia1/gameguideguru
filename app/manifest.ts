import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GameGuide Guru",
    short_name: "GameGuide",
    description:
      "Tell it where you are stuck in a game and get a clear, sourced guide.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e7",
    theme_color: "#f3f0e7",
    icons: [
      { src: "/app-icon?size=192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon?size=512", sizes: "512x512", type: "image/png" },
      {
        src: "/app-icon?size=512&maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
