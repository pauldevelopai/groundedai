// GROUNDED Cohort Dashboard — static page, reads harvest output.
//
// No framework, no build step. Loads three JSON files written by
// harvest/harvest.mjs and renders them. If the files aren't there
// (first run before any harvest), shows an empty state with
// instructions.

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let installs = [];
  let activity = [];
  let errors = [];
  let lastHarvest = null;

  async function boot() {
    // Tab nav
    $$('nav button.tab').forEach((b) =>
      b.addEventListener('click', () => activateTab(b))
    );

    const [i, a, e, lh] = await Promise.all([
      loadJson('data/installs.json'),
      loadJson('data/activity.json'),
      loadJson('data/errors.json'),
      loadJson('data/last_harvest.json'),
    ]);

    installs = i || [];
    activity = a || [];
    errors = e || [];
    lastHarvest = lh;

    if (!installs.length && !activity.length && !errors.length && !lastHarvest) {
      renderEmptyState();
      return;
    }

    renderHarvestMeta();
    renderInstalls();
    renderActivity();
    renderErrors();
    wireFilters();
  }

  function activateTab(btn) {
    $$('nav button.tab').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.panel').forEach((p) =>
      p.classList.toggle('active', p.id === 'panel-' + btn.dataset.panel)
    );
  }

  // ─── Empty state ──────────────────────────────────────────────

  function renderEmptyState() {
    const main = document.querySelector('main');
    main.innerHTML = `
      <div class="empty-state">
        <strong>No harvest data yet.</strong>
        <p>Run the harvest to pull telemetry from every newsroom's fork of every Node:</p>
        <code>cd groundedai &amp;&amp; node harvest/harvest.mjs</code>
        <p style="margin-top:1rem;font-size:0.85rem">Prerequisites: <code>gh</code> CLI installed and authenticated (<code>gh auth status</code>).</p>
      </div>
    `;
  }

  // ─── Harvest meta ─────────────────────────────────────────────

  function renderHarvestMeta() {
    if (!lastHarvest) {
      $('#harvest-meta').textContent = 'No harvest yet.';
      return;
    }
    const when = new Date(lastHarvest.timestamp);
    const ago = humanAgo(when);
    $('#harvest-meta').innerHTML =
      `Last harvest: ${when.toLocaleString()} (${ago})<br>` +
      `${lastHarvest.install_count} install(s) · ${lastHarvest.activity_count} activity entries · ${lastHarvest.error_count} error(s)`;
  }

  // ─── Installs panel ───────────────────────────────────────────

  function renderInstalls() {
    // Summary cards
    const byNode = groupBy(installs, 'node_slug');
    const nodes = Object.keys(byNode);
    const newsrooms = unique(installs.map((i) => i.fork_owner));
    const totalBoots = installs.reduce((s, i) => s + (i.boot_count || 0), 0);
    const fresh = installs.filter((i) => recencyClass(i.last_boot) === 'fresh').length;

    $('#summary-installs').innerHTML = [
      summaryCard('Nodes', nodes.length, nodes.join(', ') || ''),
      summaryCard('Newsrooms', newsrooms.length, newsrooms.join(', ') || ''),
      summaryCard('Installs', installs.length, totalBoots + ' total boots'),
      summaryCard('Active in last 7d', fresh, fresh === installs.length ? 'all' : (installs.length - fresh) + ' stale'),
    ].join('');

    // Matrix table
    if (!installs.length) {
      $('#installs-matrix').innerHTML = '<div class="empty" style="padding:1rem 1.5rem">No installs recorded yet.</div>';
      return;
    }

    const rows = installs
      .slice()
      .sort((a, b) => (b.last_boot || '').localeCompare(a.last_boot || ''))
      .map((i) => {
        const rec = recencyClass(i.last_boot);
        return `
          <tr>
            <td>${esc(i.fork_owner || '?')}</td>
            <td>${esc(i.node_display_name || i.node_slug)}</td>
            <td><code>${esc(i.node_version || '?')}</code></td>
            <td><code>${esc(i.runtime_version || '?')}</code></td>
            <td class="num">${i.boot_count || 0}</td>
            <td class="${rec}">${i.last_boot ? humanAgo(new Date(i.last_boot)) : '—'}</td>
            <td class="num">${i.first_boot ? new Date(i.first_boot).toLocaleDateString() : '—'}</td>
            <td>${esc(i.platform || '—')}</td>
          </tr>
        `;
      }).join('');

    $('#installs-matrix').innerHTML = `
      <table>
        <thead><tr>
          <th>Newsroom</th><th>Node</th><th>Version</th><th>Runtime</th>
          <th>Boots</th><th>Last seen</th><th>First boot</th><th>Platform</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ─── Activity panel ───────────────────────────────────────────

  function renderActivity() {
    const last7d = activity.filter((a) => isWithin(a.ts, 7));
    const last24h = activity.filter((a) => isWithin(a.ts, 1));
    const byNode = groupBy(activity, 'node_slug');

    $('#summary-activity').innerHTML = [
      summaryCard('Total actions', activity.length, ''),
      summaryCard('Last 7 days', last7d.length, ''),
      summaryCard('Last 24 hours', last24h.length, ''),
      summaryCard('Nodes active', Object.keys(byNode).length, ''),
    ].join('');

    populateFilter('#filter-node-activity', unique(activity.map((a) => a.node_slug)));
    populateFilter('#filter-newsroom-activity', unique(activity.map((a) => a.fork_owner)));

    renderActivityList();
  }

  function renderActivityList() {
    const nodeFilter = $('#filter-node-activity').value;
    const newsroomFilter = $('#filter-newsroom-activity').value;
    let list = activity.slice().reverse(); // most recent first
    if (nodeFilter) list = list.filter((a) => a.node_slug === nodeFilter);
    if (newsroomFilter) list = list.filter((a) => a.fork_owner === newsroomFilter);
    list = list.slice(0, 200);

    if (!list.length) {
      $('#activity-list').innerHTML = '<div class="empty">No activity matches the current filters.</div>';
      return;
    }

    $('#activity-list').innerHTML = list.map((a) => {
      const extras = Object.entries(a)
        .filter(([k]) => !['ts', 'kind', 'op', 'node_slug', 'node_display_name', 'fork_owner', 'newsroom_id', 'host_id', 'node_version'].includes(k))
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' · ');
      return `
        <div class="activity-row">
          <span class="when">${a.ts ? new Date(a.ts).toLocaleString() : '—'}</span>
          <span class="pill node">${esc(a.node_display_name || a.node_slug || '?')}</span>
          <span class="pill newsroom">${esc(a.fork_owner || '?')}</span>
          <strong>${esc(a.op || a.kind || 'event')}</strong>
          ${extras ? ' · ' + esc(extras) : ''}
        </div>
      `;
    }).join('');
  }

  // ─── Issues panel ─────────────────────────────────────────────

  function renderErrors() {
    const last7d = errors.filter((e) => isWithin(e.ts, 7));
    const last24h = errors.filter((e) => isWithin(e.ts, 1));
    const byOp = groupBy(errors, 'op');
    const topOp = Object.entries(byOp).sort((a, b) => b[1].length - a[1].length)[0];

    $('#summary-issues').innerHTML = [
      summaryCard('Total errors', errors.length, ''),
      summaryCard('Last 7 days', last7d.length, ''),
      summaryCard('Last 24 hours', last24h.length, last24h.length ? 'needs attention' : ''),
      summaryCard('Top error op', topOp ? topOp[0] : '—', topOp ? topOp[1].length + ' occurrences' : ''),
    ].join('');

    populateFilter('#filter-node-issues', unique(errors.map((e) => e.node_slug)));
    populateFilter('#filter-newsroom-issues', unique(errors.map((e) => e.fork_owner)));

    renderErrorsList();
  }

  function renderErrorsList() {
    const nodeFilter = $('#filter-node-issues').value;
    const newsroomFilter = $('#filter-newsroom-issues').value;
    let list = errors.slice().reverse();
    if (nodeFilter) list = list.filter((e) => e.node_slug === nodeFilter);
    if (newsroomFilter) list = list.filter((e) => e.fork_owner === newsroomFilter);
    list = list.slice(0, 200);

    if (!list.length) {
      $('#errors-list').innerHTML = '<div class="empty">No errors match the current filters.</div>';
      return;
    }

    $('#errors-list').innerHTML = list.map((e) => `
      <div class="error-row">
        <span class="when">${e.ts ? new Date(e.ts).toLocaleString() : '—'}</span>
        <span class="pill node">${esc(e.node_display_name || e.node_slug || '?')}</span>
        <span class="pill newsroom">${esc(e.fork_owner || '?')}</span>
        <span class="op">${esc(e.op || 'unknown')}</span>
        <div class="msg">${esc(e.message || '(no message)')}</div>
        ${e.context ? `<div class="ctx">context: ${esc(JSON.stringify(e.context))}</div>` : ''}
        ${e.stack_first_line ? `<div class="ctx">${esc(e.stack_first_line)}</div>` : ''}
      </div>
    `).join('');
  }

  function wireFilters() {
    ['#filter-node-activity', '#filter-newsroom-activity'].forEach((sel) =>
      $(sel).addEventListener('change', renderActivityList)
    );
    ['#filter-node-issues', '#filter-newsroom-issues'].forEach((sel) =>
      $(sel).addEventListener('change', renderErrorsList)
    );
  }

  // ─── helpers ──────────────────────────────────────────────────

  async function loadJson(path) {
    try {
      const r = await fetch(path);
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function summaryCard(label, value, sub) {
    return `<div class="summary"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`;
  }

  function populateFilter(sel, values) {
    const el = $(sel);
    const current = el.value;
    el.innerHTML = '<option value="">All</option>' + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (values.includes(current)) el.value = current;
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const k = item[key] || '(unknown)';
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  function unique(arr) {
    return Array.from(new Set(arr.filter((x) => x != null)));
  }

  function isWithin(ts, days) {
    if (!ts) return false;
    return (Date.now() - new Date(ts).getTime()) < days * 24 * 60 * 60 * 1000;
  }

  function recencyClass(ts) {
    if (!ts) return 'cold';
    const ageDays = (Date.now() - new Date(ts).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays < 7) return 'fresh';
    if (ageDays < 30) return 'stale';
    return 'cold';
  }

  function humanAgo(date) {
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
    return Math.floor(sec / 604800) + 'w ago';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  boot();
})();
