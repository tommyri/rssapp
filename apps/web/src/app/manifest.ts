import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Currentfold",
    short_name: "Currentfold",
    description:
      "A focused reader for following, saving, and returning to the open web.",
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
