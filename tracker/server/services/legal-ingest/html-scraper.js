// HTML list-page scraper — for regulator and news sites that don't expose RSS.
//
// Config schema (stored in ai_legal_sources.config JSONB):
// {
//   "item_selector":    "article.news-item",        // CSS selector for each list item
//   "title_selector":   "h3 a",                     // selector WITHIN each item for the title element (also holds the link by default)
//   "url_selector":     "h3 a",                     // optional — if different from title_selector
//   "url_attribute":    "href",                     // default 'href'
//   "date_selector":    "time",                     // optional
//   "date_attribute":   "datetime",                 // optional — default innerText
//   "summary_selector": ".summary",                 // optional
//   "base_url":         "https://example.com"       // optional — for resolving relative hrefs
// }
//
// Output: raw items in the shape the dispatcher expects.

import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'AI Legal Tracker / ailegal.co.za (bot; contact via site)';
const TIMEOUT = 20000;
const MAX_ITEMS = 60;

export async function scrapeHtml(source) {
  const config = source.config || {};
  const itemSel = config.item_selector;
  const titleSel = config.title_selector;
  if (!itemSel || !titleSel) {
    throw new Error('html source requires config.item_selector and config.title_selector');
  }
  const urlSel   = config.url_selector || titleSel;
  const urlAttr  = config.url_attribute || 'href';
  const dateSel  = config.date_selector || null;
  const dateAttr = config.date_attribute || null;
  const sumSel   = config.summary_selector || null;
  const baseUrl  = config.base_url || (() => {
    try { const u = new URL(source.url); return u.origin; } catch { return null; }
  })();

  const res = await axios.get(source.url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
    maxRedirects: 5,
    responseType: 'text',
    validateStatus: s => s >= 200 && s < 400,
  });

  const $ = cheerio.load(res.data);
  const items = [];

  $(itemSel).each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const $el = $(el);

    const title = ($el.find(titleSel).first().text() || '').replace(/\s+/g, ' ').trim();
    if (!title) return;

    let url = $el.find(urlSel).first().attr(urlAttr);
    if (url && baseUrl && !/^https?:\/\//i.test(url)) {
      try { url = new URL(url, baseUrl).toString(); } catch { /* leave raw */ }
    }

    let published_at = null;
    if (dateSel) {
      const dateEl = $el.find(dateSel).first();
      const raw = (dateAttr ? dateEl.attr(dateAttr) : dateEl.text()) || null;
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) published_at = d.toISOString();
      }
    }

    const summary = sumSel ? ($el.find(sumSel).first().text() || '').replace(/\s+/g, ' ').trim() : '';

    items.push({
      external_id: url || `${source.id}:${title}`,
      url: url || null,
      title: title.slice(0, 500),
      content: (summary || title).slice(0, 4000),
      author: null,
      published_at,
      raw_payload: { title, url, published_at, summary, selector_hit: itemSel },
    });
  });

  return items;
}
