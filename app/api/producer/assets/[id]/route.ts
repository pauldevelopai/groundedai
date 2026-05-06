// /api/producer/assets/:id — stream a generated audio (or future video)
// asset back to the editor. Newsroom-scoped: an asset only streams to a
// caller in the same newsroom that owns it.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import fs from 'fs';
import path from 'path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MIME_BY_EXT: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, newsroom_id, kind, format, storage_path, bytes
       FROM producer_assets WHERE id = $1`,
    [id]
  );
  const asset = rows[0];
  if (!asset || asset.newsroom_id !== session.newsroomId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // storage_path is project-relative — anchor it to cwd and reject any
  // path that escapes the project root (defence against future bugs that
  // stash a wild absolute path in there).
  const root = process.cwd();
  const abs = path.resolve(root, asset.storage_path);
  if (!abs.startsWith(root + path.sep)) {
    return NextResponse.json({ error: 'Invalid asset path' }, { status: 500 });
  }
  if (!fs.existsSync(abs)) {
    return NextResponse.json({ error: 'Asset file missing' }, { status: 410 });
  }

  const ext = path.extname(abs).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(asset.bytes ?? fs.statSync(abs).size),
      'Cache-Control': 'private, max-age=60',
    },
  });
}
