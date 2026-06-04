// Bluesky public feed scraper.
//
// We hit the public app.bsky.feed.getAuthorFeed endpoint — no auth required
// for public accounts. The source row's config.handle drives which handle
// to read.
//
// Example source config:
//   { "handle": "emilymbender.bsky.social" }
//
// Returns raw items in the shape the dispatcher expects.

import axios from 'axios';

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const UA  = 'AI Legal Tracker / ailegal.co.za (social listener)';
const FETCH_TIMEOUT = 15000;

export async function scrapeBluesky(source) {
  const handle = source.config?.handle;
  if (!handle) throw new Error('bluesky source requires config.handle');

  const { data } = await axios.get(API, {
    timeout: FETCH_TIMEOUT,
    headers: { 'User-Agent': UA },
    params: { actor: handle, limit: 50 },
  });

  const feed = data?.feed || [];
  return feed.map(entry => {
    const p = entry.post || {};
    const author = p.author?.handle || handle;
    const text = p.record?.text || '';
    const cid = p.cid;
    const uri = p.uri;
    // Convert at:// URI to public URL: at://did:plc:xyz/app.bsky.feed.post/abc
    // → https://bsky.app/profile/did:plc:xyz/post/abc
    let url = null;
    if (uri) {
      const parts = uri.replace('at://', '').split('/');
      if (parts.length >= 3) url = `https://bsky.app/profile/${parts[0]}/post/${parts[2]}`;
    }
    return {
      external_id: cid || uri,
      url,
      title: text.split('\n')[0].slice(0, 200),
      content: text.slice(0, 4000),
      author,
      published_at: p.record?.createdAt || p.indexedAt || null,
      raw_payload: { cid, uri, author, text },
    };
  });
}
