// GET /api/archive/entity-types — list entity types visible to this newsroom
// (universal + newsroom-specific). Used by the entity-type filter dropdown
// + the "manage custom types" UI.
//
// POST /api/archive/entity-types — add a newsroom-specific zero-shot type
// (Haiku/GLiNER consumer). Builder+admin only.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
const {
  listForNewsroom,
  addNewsroomType,
  seedUniversalTypes,
} = require('@/lib/archive/entity_types');

export async function GET(_req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await seedUniversalTypes();
  const types = await listForNewsroom(session.newsroomId);
  return NextResponse.json({ types });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: { slug?: string; label?: string; promptHint?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const slug = (body.slug || '').trim().toLowerCase();
  const label = (body.label || '').trim();
  const promptHint = (body.promptHint || '').trim();
  const description = (body.description || '').trim() || null;

  if (!/^[a-z][a-z0-9_]{1,40}$/.test(slug)) {
    return NextResponse.json(
      { error: 'slug must be 2-40 chars, lowercase, alphanumeric + underscore, starting with a letter' },
      { status: 400 }
    );
  }
  if (label.length < 2 || label.length > 60) {
    return NextResponse.json({ error: 'label must be 2-60 chars' }, { status: 400 });
  }
  if (promptHint.length < 3 || promptHint.length > 200) {
    return NextResponse.json({ error: 'promptHint must be 3-200 chars' }, { status: 400 });
  }

  try {
    const type = await addNewsroomType(session.newsroomId, { slug, label, promptHint, description });
    return NextResponse.json(type, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return NextResponse.json({ error: 'A type with that slug already exists for this newsroom' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
