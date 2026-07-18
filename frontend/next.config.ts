import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend already compresses/resizes uploaded images (sharp, webp) before storage,
  // so Next's own image optimizer (which needs sharp) is unnecessary.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
