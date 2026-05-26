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
import config from './config.js';
import publicRoutes from './routes/public.js';
import publicHtmlRoutes from './routes/public-html.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/public', publicRoutes);
app.use(publicHtmlRoutes); // SSR detail pages: /lawsuits/:id, /regulations/:id, …

app.get('/healthz', (req, res) => res.json({ ok: true, slice: 'ai-legal-public' }));

const port = config.port;
app.listen(port, () => {
  console.log(`tracker AI-Legal (public API) on :${port}`);
});

export default app;
