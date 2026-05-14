// Tool: web_fetch
//
// Fetches a single public URL and returns the cleaned article text + a
// trusted-source flag (per the newsroom's trusted-sources allowlist).
// Wraps lib/research/scrape.js, which respects robots.txt, rate-limits
// per host, and times out at 20s by default.

const { scrapeUrl } = require('../../../research/scrape');

const tool = {
  name: 'web_fetch',
  description:
    'Fetch the article text at a public URL. Returns the cleaned article body, title, and whether the source is on this newsroom\'s trusted-sources allowlist. Use sparingly — one fetch per URL per loop. Only use http(s) URLs.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The fully-qualified http(s) URL to fetch.',
      },
    },
    required: ['url'],
  },
  async run({ url }, ctx) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { error: 'url must be an http(s) URL' };
    }
    try {
      const out = await scrapeUrl(url, { newsroomId: ctx.newsroomId });
      return {
        url: out.url,
        final_url: out.finalUrl,
        title: out.title,
        // Cap text so we don't blow the context budget on long pages.
        text: (out.text || '').slice(0, 12_000),
        byte_size: out.byteSize,
        trusted_source: !!out.trustedSource,
        trusted_reason: out.trustedReason || null,
      };
    } catch (err) {
      return { error: err.message };
    }
  },
};

module.exports = tool;
