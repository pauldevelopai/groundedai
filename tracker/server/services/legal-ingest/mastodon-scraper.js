// Mastodon public feed scraper.
//
// Every Mastodon instance exposes /api/v1/accounts/:id/statuses without auth.
// We first look up the account by webfinger (/api/v1/accounts/lookup?acct=…).
//
// Source config:
//   { "instance": "mastodon.social", "handle": "user" }
//   — OR a full acct like "user@mastodon.social" in handle alone.

import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'AI Legal Tracker / ailegal.co.za (social listener)';
const FETCH_TIMEOUT = 15000;

export async function scrapeMastodon(source) {
  let instance = source.config?.instance;
  let handle   = source.config?.handle;
  if (!instance && handle?.includes('@')) {
    const [u, host] = handle.split('@');
    handle = u;
    instance = host;
  }
  if (!instance || !handle) throw new Error('mastodon source requires config.instance + config.handle');

  const base = `https://${instance}`;
  const lookup = await axios.get(`${base}/api/v1/accounts/lookup`, {
    timeout: FETCH_TIMEOUT,
    headers: { 'User-Agent': UA },
    params: { acct: handle },
  });
  const accountId = lookup.data?.id;
  if (!accountId) throw new Error(`mastodon: no account found for @${handle}@${instance}`);

  const { data: statuses } = await axios.get(`${base}/api/v1/accounts/${accountId}/statuses`, {
    timeout: FETCH_TIMEOUT,
    headers: { 'User-Agent': UA },
    params: { limit: 40, exclude_replies: true, exclude_reblogs: false },
  });

  return (statuses || []).map(s => {
    const text = htmlToText(s.content || '');
    return {
      external_id: s.id,
      url: s.url || s.uri,
      title: text.split('\n')[0].slice(0, 200),
      content: text.slice(0, 4000),
      author: s.account?.acct ? `@${s.account.acct}@${instance}` : handle,
      published_at: s.created_at || null,
      raw_payload: { id: s.id, uri: s.uri, reblog: !!s.reblog, visibility: s.visibility },
    };
  });
}

function htmlToText(html) {
  try { return cheerio.load(`<div>${html}</div>`)('div').text().replace(/\s+/g, ' ').trim(); }
  catch { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
}
