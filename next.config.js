/** @type {import('next').NextConfig} */

// The absorbed Tracker (AI-Legal) runs as an in-repo Express service
// (tracker/server) — start it with `npm run tracker`. We mount it at /tracker
// by forwarding /tracker/* to it (the prefix is stripped, so /tracker/api/public/*
// hits the service's /api/public/*). Override the target in prod via TRACKER_URL.
const TRACKER_URL = process.env.TRACKER_URL || 'http://localhost:3055';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/tracker', destination: `${TRACKER_URL}/` },
      { source: '/tracker/:path*', destination: `${TRACKER_URL}/:path*` },
    ];
  },
};

module.exports = nextConfig;
