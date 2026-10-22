import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard reads per-user data from SQLite on every request, so the
  // static-shell model of Cache Components buys little here and would require
  // Suspense boundaries around every data read. Keep the classic dynamic model.
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
