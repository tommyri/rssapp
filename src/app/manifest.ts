import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "rssapp",
    short_name: "rssapp",
    description: "A self-hosted RSS reader",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f5",
    theme_color: "#a33422",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
