// app/nodes/makanday-analytics/_node.ts
// ─────────────────────────────────────────────────────────────────────────
// Server-only glue between the vendored MakanDay node and GROUNDED. The node's
// own framework-free handlers (nodes/makanday-analytics/lib/handlers.js) run
// UNCHANGED against the session-scoped Postgres host facade (lib/nodes/host).
//
// Not a route itself — Next only routes route.ts / page.tsx. The `_` prefix
// keeps it out of routing regardless.
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { createNodeHost } from '@/lib/nodes/host';
import * as handlers from '@/nodes/makanday-analytics/lib/handlers.js';

export const SLUG = 'makanday-analytics';
export { handlers, createNodeHost };

type NodeHandlerName = keyof typeof handlers;

/**
 * Session-gate the request, build the newsroom-scoped host, run one node
 * handler by name, and JSON-respond — mirroring the runtime's `wrap()`
 * (grounded-node-runtime/src/server.js) but authenticated by the GROUNDED
 * session instead of an open standalone server.
 */
export async function callNode(name: NodeHandlerName, input?: unknown): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const host = createNodeHost({ slug: SLUG, session });
  try {
    const fn = handlers[name] as (host: unknown, input?: unknown) => Promise<unknown>;
    return NextResponse.json(await fn(host, input));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'node error';
    // Best-effort structured log to the node's own errors table; never throws.
    try {
      await host.log.error({ op: String(name), error: err });
    } catch {
      /* swallowed — telemetry must not break the response */
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
