// One-shot migration: swap inline workspace headers for <GlobalNav>.
// Idempotent — files that already use GlobalNav are skipped.
//
// Usage: node replace_headers.js [--dry]
//
// Strategy:
//   1. Read TSX files under app/, skip BuilderShell (it has its own dense rail).
//   2. If the file already imports GlobalNav, skip.
//   3. Find the FIRST <header ...>…</header> block — that's the workspace nav.
//   4. Pull a `currentApp` label from the file path → known mapping.
//   5. Replace the entire <header>…</header> with a <GlobalNav currentApp="…"
//      role={…} /> tag, passing whatever role binding is in scope.
//   6. Insert `import GlobalNav from '@/app/components/GlobalNav';` near the
//      existing imports (next to ExternalToolLinks if present, else after
//      the first `import` statement).

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dry = process.argv.includes('--dry');

// Path-prefix → label mapping. Matched longest-first so detail pages share
// their parent workspace's label.
const APP_LABELS = [
  ['app/archive', '📚 Archivist'],
  ['app/audience', '👥 Audience Analytics Manager'],
  ['app/builder', 'Builder'],
  ['app/distribution', '📡 Digital News Gatherer'],
  ['app/fundraiser', '💰 Fundraiser'],
  ['app/guide', 'Help'],
  ['app/learning', '📰 Learning'],
  ['app/newsroom', '📝 Newsroom profile'],
  ['app/operations', '🛠 Operations Manager'],
  ['app/producer', '🎬 Audio & Video Producer'],
  ['app/research', '🔎 Research'],
  ['app/run', 'Run'],
  ['app/social', '🛰 Social media listener'],
  ['app/translation', '🌐 Translator'],
  ['app/verifier', '🛡 Verifier'],
];

const SKIP_FILES = new Set([
  'app/builder/BuilderShell.tsx',          // own dense rail (top nav)
  'app/builder/StarterPicker.tsx',         // child of BuilderShell — section header, not nav
  'app/builder/WorkflowRunner.tsx',        // child of BuilderShell — workflow card header
  'app/team/TeamPageClient.tsx',           // /team has no top nav; <header> is a section heading
  'app/components/GlobalNav.tsx',          // the component itself
]);

function pickLabel(file) {
  // Longest match wins
  let best = '';
  let label = 'Workspace';
  for (const [prefix, l] of APP_LABELS) {
    if (file.startsWith(prefix) && prefix.length > best.length) {
      best = prefix; label = l;
    }
  }
  return label;
}

function detectRole(content) {
  // Look at known patterns we've seen in workspace files.
  if (/\brole=\{role\}/.test(content)) return 'role={role}';
  if (/role:\s*'(admin|builder|user)'/.test(content)) return null; // hard-coded probably
  if (/\bsession\.role\b/.test(content)) return 'role={session.role}';
  if (/\bcurrentUser\.role\b/.test(content)) return 'role={currentUser.role}';
  if (/\bu\.role\b/.test(content)) return 'role={u.role as any}';
  // server pages — role may be on a server-side `session` object the page reads
  if (/getCurrentSession/.test(content)) return null; // we'll use the default
  return null;
}

const files = execSync('find app -name "*.tsx" -type f').toString().split('\n').filter(Boolean);

let modified = 0;
let skipped = 0;

for (const file of files) {
  if (SKIP_FILES.has(file)) { skipped++; continue; }
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('<GlobalNav')) { skipped++; continue; }

  // Find the first <header ... > ... </header>
  const headerStart = content.indexOf('<header');
  if (headerStart === -1) { skipped++; continue; }
  const headerEnd = content.indexOf('</header>', headerStart);
  if (headerEnd === -1) { skipped++; continue; }
  const endTag = '</header>';
  const fullEnd = headerEnd + endTag.length;

  const label = pickLabel(file);
  const role = detectRole(content);

  // Indent inferred from the line containing <header
  const lineStart = content.lastIndexOf('\n', headerStart) + 1;
  const indent = content.slice(lineStart, headerStart);

  const props = ['currentApp=' + JSON.stringify(label)];
  if (role) props.push(role);
  const replacement = `<GlobalNav ${props.join(' ')} />`;

  content = content.slice(0, headerStart) + replacement + content.slice(fullEnd);

  // Insert the import if absent
  if (!content.includes("from '@/app/components/GlobalNav'")) {
    if (/import ExternalToolLinks/.test(content)) {
      content = content.replace(
        /(import ExternalToolLinks [^\n]+\n)/,
        `$1import GlobalNav from '@/app/components/GlobalNav';\n`
      );
    } else if (/import Link/.test(content)) {
      content = content.replace(
        /(import Link [^\n]+\n)/,
        `$1import GlobalNav from '@/app/components/GlobalNav';\n`
      );
    } else {
      // Fallback: prepend after first import line
      content = content.replace(/(import [^\n]+\n)/, `$1import GlobalNav from '@/app/components/GlobalNav';\n`);
    }
  }

  if (!dry) fs.writeFileSync(file, content);
  console.log(`${dry ? '(dry) ' : ''}MIGRATED: ${file}  →  currentApp="${label}"${role ? '  ' + role : ''}`);
  modified++;
}

console.log(`\n${modified} migrated, ${skipped} skipped${dry ? ' (DRY RUN)' : ''}.`);
