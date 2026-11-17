import type { NextConfig } from "next";

/**
 * Path prefix baked in at build time. Unset or blank keeps the app at `/`.
 * `gobos` and `/gobos` are the same prefix. A trailing slash is invalid.
 */
function normalizeBasePath(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.endsWith("/")) {
    throw new Error(
      `BASE_PATH must not end with a slash (received ${JSON.stringify(raw)}). Use gobos or /gobos.`,
    );
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

const basePath = normalizeBasePath(process.env.BASE_PATH);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
