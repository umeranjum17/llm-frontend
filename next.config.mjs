import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: false, // Disabled to ensure fresh code after deployments
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Auto-activate new SW to prevent code/DB schema mismatch after deployments
    // Without this, old cached code may try to access new DB schema, causing initialization failures
    skipWaiting: true,
    clientsClaim: true,
    // Selective precaching - exclude unnecessary files to reduce cache size
    exclude: [
      /\.map$/, // Source maps
      /hot-update/, // Hot module replacement files (dev only, but good to exclude)
      /_buildManifest\.js$/, // Build manifest (changes every build)
      /_ssgManifest\.js$/, // SSG manifest
      /\/api\//, // API routes (shouldn't be cached statically)
      /\.test\./, // Test files (shouldn't be in prod, but safety)
      /\.spec\./, // Spec files
    ],
    // Clean up caches when storage quota is exceeded
    cleanupOutdatedCaches: true,
    // Limit runtime cache size to prevent unbounded growth
    runtimeCaching: [
      {
        // Cache page navigations with network-first strategy
        urlPattern: /^https?.*\/(?!api\/).*$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "pages-cache",
          expiration: {
            maxEntries: 50, // Limit to 50 cached pages
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
            purgeOnQuotaError: true, // Clear on storage overflow
          },
        },
      },
      {
        // JS files: NetworkFirst to ensure fresh code after deployments
        // This prevents stale JS serving old schema expectations
        urlPattern: /\.js$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "js-cache",
          networkTimeoutSeconds: 10, // Fall back to cache after 10s
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours (reduced from 30 days)
            purgeOnQuotaError: true,
          },
        },
      },
      {
        // Static assets (CSS, fonts, images): CacheFirst is safe
        // These don't affect schema or app logic
        urlPattern: /\.(?:css|woff2?|png|jpg|jpeg|gif|svg|ico)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
            purgeOnQuotaError: true,
          },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable experimental features for React 19
  experimental: {
    reactCompiler: false,
  },
  // Handle node: protocol imports from export libraries (pptxgenjs uses node:https)
  serverExternalPackages: ["pptxgenjs"],
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        https: false,
        http: false,
        stream: false,
        crypto: false,
        zlib: false,
        path: false,
        os: false,
      };
      // Ignore node: protocol modules on client side
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
    }
    return config;
  },
  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss: http://localhost:* http://100.0.0.0/8",
              "frame-src 'self' https://codesandbox.io https://stackblitz.com",
              "worker-src 'self' blob:",
              "media-src 'self' blob:",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
