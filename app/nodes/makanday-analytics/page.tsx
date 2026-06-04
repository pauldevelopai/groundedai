// /nodes/makanday-analytics — the MakanDay Audience Signal node, running online
// inside GROUNDED on the integrated host facade. Session-gated. Reads the
// vendored node's own front (public/index.html + public/app.js) at request time
// so a submodule bump flows straight through.
import { redirect } from 'next/navigation';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentSession } from '@/app/lib/session';
import NodeDashboard from './NodeDashboard';

export const dynamic = 'force-dynamic';

export default async function MakandayNodePage() {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const pub = join(process.cwd(), 'nodes', 'makanday-analytics', 'public');
  const html = readFileSync(join(pub, 'index.html'), 'utf8');
  const appJs = readFileSync(join(pub, 'app.js'), 'utf8');

  const styles = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  let body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '';
  // Drop the node's own <script> tags (we inject app.js ourselves, behind the
  // fetch shim) and correct the standalone "running locally" kicker.
  body = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace('running locally', 'running on GROUNDED');

  return <NodeDashboard styles={styles} body={body} appJs={appJs} />;
}
