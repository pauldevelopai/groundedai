// Tracker (AI-Legal) — the absorbed app's server, trimmed to the AI-Legal slice
// GROUNDED keeps. Runs in-repo as part of groundedai, pointed at the shared
// Postgres (the ai_* tables imported by migration 039). Fronted by grounded at
// /tracker (Next rewrite — added in a later stage).
//
// STAGE 1 (this file): the public AI-Legal read surface — lawsuits / regulations
// / usecases / tools / sources / feeds + the SSR OG detail pages. No auth needed
// (public). Admin CRUD, the scraper ingestion pipeline, the auth bridge (H2), and
// the SPA front are absorbed in later stages.
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import config from './config.js';
import publicRoutes from './routes/public.js';
import publicHtmlRoutes from './routes/public-html.js';
import usecasesRoutes from './routes/usecases.js';
import { requireAuth } from './middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, '..', 'client', 'dist');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true, slice: 'ai-legal-public' }));

app.use('/api/public', publicRoutes);
app.use(publicHtmlRoutes); // SSR detail pages: /lawsuits/:id, /regulations/:id, …

// Admin CRUD — gated by the GROUNDED session bridge (one sign-in). Use-cases is
// the clean, db-only admin route; the scraper-backed lawsuits/regulations admin
// land with the ingestion stage (they share the scraper service surface).
app.use('/api/usecases', requireAuth, usecasesRoutes);

// Serve the built SPA (Vite base '/tracker/'). Static assets first, then a
// catch-all so client-side routes (/legal/*) return index.html. Runs after the
// API + SSR routes, so those win. `npm run build` in tracker/client populates dist.
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'Not found' });
    res.sendFile(join(CLIENT_DIST, 'index.html'));
  });
}

const port = config.port;
app.listen(port, () => {
  console.log(`tracker AI-Legal (public API) on :${port}`);
});

export default app;
