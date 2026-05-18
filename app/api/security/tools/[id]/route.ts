// /api/security/tools/:id — GET / PATCH / DELETE one external-tool inventory row.
//
// Tenant-scoped: 404 if the row isn't in the caller's newsroom.
// PATCH + DELETE require builder + admin role; GET is open to any role.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';
import { validateToolPayload } from '../route';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, vendor, tool_name, data_residency, declared_use,
            data_kinds_exposed, data_kinds_other, notes,
            added_by, created_at, updated_at
       FROM security_external_tools
      WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ tool: rows[0] });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const exist = await pool.query(
    `SELECT id FROM security_external_tools WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (exist.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Parameters<typeof validateToolPayload>[0];
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const validation = validateToolPayload(body, { partial: true });
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [];
  function add(col: string, val: unknown) {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  }
  if (validation.fields.vendor !== undefined) add('vendor', validation.fields.vendor);
  if (validation.fields.tool_name !== undefined) add('tool_name', validation.fields.tool_name);
  if ('data_residency' in body) add('data_residency', validation.fields.data_residency);
  if ('declared_use' in body) add('declared_use', validation.fields.declared_use);
  if (validation.fields.data_kinds_exposed !== undefined) add('data_kinds_exposed', validation.fields.data_kinds_exposed);
  if ('data_kinds_other' in body) add('data_kinds_other', validation.fields.data_kinds_other);
  if ('notes' in body) add('notes', validation.fields.notes);

  if (sets.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  sets.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE security_external_tools SET ${sets.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, vendor, tool_name, data_residency, declared_use,
                data_kinds_exposed, data_kinds_other, notes,
                added_by, created_at, updated_at`,
    values
  );
  return NextResponse.json({ tool: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const { rowCount } = await pool.query(
    `DELETE FROM security_external_tools WHERE id = $1 AND newsroom_id = $2`,
    [id, session.newsroomId]
  );
  if (rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
