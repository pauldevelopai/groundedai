// RSS 2.0 / Atom scraper.
//
// Uses cheerio in XML mode (already a Holly dep) so we don't add a new package.
// Returns an array of raw items in the shape expected by the dispatcher:
//   { external_id, url, title, content, author, published_at }
//
// Handles RSS 2.0 (<rss><channel><item>) and Atom 1.0 (<feed><entry>).
import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'AI Legal Tracker / ailegal.co.za (bot; contact via site)';
const MAX_ITEMS = 100;
const FETCH_TIMEOUT = 20000;

export async function scrapeRss(source) {
  const res = await axios.get(source.url, {
    timeout: FETCH_TIMEOUT,
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
    responseType: 'text',
    validateStatus: s => s >= 200 && s < 300,
  });

  const $ = cheerio.load(res.data, { xml: true });

  // Detect feed type
  const isAtom = $('feed').length > 0;
  const itemSel = isAtom ? 'entry' : 'item';

  const items = [];
  $(itemSel).each((i, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const $el = $(el);

    let url = null;
    if (isAtom) {
      // Atom: <link rel="alternate" href="…"/> preferred, else first <link>
      const alt = $el.find('link[rel="alternate"]').attr('href');
      url = alt || $el.find('link').first().attr('href') || null;
    } else {
      // RSS 2.0: <link>text</link>
      url = $el.find('link').first().text().trim() || $el.find('guid').text().trim() || null;
    }

    const title = ($el.find('title').first().text() || '').trim();
    const author = isAtom
      ? ($el.find('author > name').first().text() || '').trim()
      : ($el.find('dc\\:creator').first().text() || $el.find('author').first().text() || '').trim();

    // Body: Atom <content>/<summary>, RSS <content:encoded>/<description>
    const content = (
      $el.find('content\\:encoded').first().text()
      || $el.find('content').first().text()
      || $el.find('summary').first().text()
      || $el.find('description').first().text()
      || ''
    ).trim();

    const rawDate = (
      $el.find('pubDate').first().text()
      || $el.find('published').first().text()
      || $el.find('updated').first().text()
      || $el.find('dc\\:date').first().text()
      || ''
    ).trim();
    const published_at = parseDate(rawDate);

    const external_id = (
      $el.find('guid').first().text().trim()
      || $el.find('id').first().text().trim()
      || url
      || null
    );

    if (!title && !url) return; // skip junk

    items.push({
      external_id,
      url,
      title: stripHtml(title).slice(0, 500),
      content: stripHtml(content).slice(0, 8000),
      author: author || null,
      published_at,
      raw_payload: { title, url, author, rawDate, content: content.slice(0, 2000) },
    });
  });

  return items;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function stripHtml(s) {
  if (!s) return '';
  // Cheerio can parse HTML and text() extract. For RSS-embedded HTML this is cleaner.
  try {
    return cheerio.load(`<div>${s}</div>`)('div').text().replace(/\s+/g, ' ').trim();
  } catch {
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
