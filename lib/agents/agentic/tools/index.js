// Default tool palette for Step 4. Individual agents can subset this
// list when wiring their agentic_mode (e.g. Verifier might allow
// archive_search + web_fetch but not invoke_agent).

const archive_search = require('./archive_search');
const web_fetch = require('./web_fetch');
const invoke_agent = require('./invoke_agent');

module.exports = {
  archive_search,
  web_fetch,
  invoke_agent,
  all: [archive_search, web_fetch, invoke_agent],
};
