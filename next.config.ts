import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The dev badge sits on top of the phone tab bar.
  devIndicators: false,
  partialPrefetching: true,
  turbopack: {
    // The dashboard folder is its own project, not part of the home folder.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
