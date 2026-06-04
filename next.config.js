/** @type {import('next').NextConfig} */

// The in-repo Tracker proxy is OPT-IN now. When this app is mounted standalone
// (the live AI-Legal tracker runs as a separate service/app), leave TRACKER_URL
// unset so there's no dead /tracker proxy. Set TRACKER_URL only if you actually
// run `npm run tracker` alongside this app and want it proxied at /tracker.
const TRACKER_URL = process.env.TRACKER_URL || '';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (!TRACKER_URL) return [];
    return [
      { source: '/tracker', destination: `${TRACKER_URL}/` },
      { source: '/tracker/:path*', destination: `${TRACKER_URL}/:path*` },
    ];
  },
};

module.exports = nextConfig;
