import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marcus OS",
    short_name: "Marcus OS",
    description: "Marcus's command center for agents, content and outreach",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f6f4",
    theme_color: "#f7f6f4",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
