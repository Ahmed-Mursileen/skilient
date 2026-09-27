import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Skilient",
    short_name: "Skilient",
    description: "Prove it. Don't claim it.",
    start_url: "/",
    display: "standalone",
    background_color: "#F0EFED",
    theme_color: "#C03910",
    icons: [
      { src: "/brand/skilient-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
