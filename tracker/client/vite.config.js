import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This copy of the SPA is the GROUNDED-integrated one: it's served under
// /tracker (grounded proxies /tracker/* -> the in-repo Tracker service). The
// base makes built asset URLs + the router basename + the publicFetch prefix
// all resolve under /tracker. Override with VITE_BASE if mounting elsewhere.
export default defineConfig({
  base: process.env.VITE_BASE || '/tracker/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3055',
        changeOrigin: true,
      },
    },
  },
});
