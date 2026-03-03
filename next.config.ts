import type { NextConfig } from "next";
// @ts-ignore
import withPWA from "next-pwa";

const withPWAConfig = withPWA({
  dest: "public",
  register: true,
  skipWaiting: false,
  fallbacks: {
    document: "/offline",
  },
});

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withPWAConfig(nextConfig);
