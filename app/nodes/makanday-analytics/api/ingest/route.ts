// POST /nodes/makanday-analytics/api/ingest → handlers.postIngest(host, { buffer, sourceLabel })
// Multipart upload (field "file") — mirrors the runtime's multer handling
// (grounded-node-runtime/src/server.js), but using the web FormData API and
// the GROUNDED session. The .docx buffer is parsed by host.parse.docxToHtml.
import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { SLUG, handlers, createNodeHost } from '../../_node';

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const host = createNodeHost({ slug: SLUG, session });
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a file to upload first.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const labelField = form.get('sourceLabel');
    const sourceLabel =
      (typeof labelField === 'string' && labelField) || file.name.replace(/\.[^.]+$/, '');

    const out = await handlers.postIngest(host, { buffer, sourceLabel });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'node error';
    try {
      await host.log.error({ op: 'ingest', error: err });
    } catch {
      /* swallowed */
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
