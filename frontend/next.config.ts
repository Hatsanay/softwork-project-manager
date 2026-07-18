import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Backend already compresses/resizes uploaded images (sharp, webp) before storage.
  // Disabling Next's built-in optimizer avoids bundling a platform-specific sharp binary
  // (dev machine is Windows, deploy target is Linux — the win32 binary would crash there).
  images: {
    unoptimized: true,
  },
  // sharp is an optional dep of next, auto-installed on this Windows dev machine.
  // The tracer bundles it into standalone regardless of `unoptimized` above, and its
  // win32 binary would crash on the Linux server — exclude it from the trace entirely.
  outputFileTracingExcludes: {
    "*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
    "/*": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
};

export default nextConfig;
