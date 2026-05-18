// /api/security/tools — Digital Security Audit Slice A.
//
// GET  — list external-tool inventory for the caller's newsroom
// POST — add a new external tool. Body:
//        { vendor, tool_name, data_residency?, declared_use?,
//          data_kinds_exposed: string[], data_kinds_other?, notes? }
//
// Auth: any role can READ (the inventory isn't sensitive); only
// builder + admin can WRITE.

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/app/lib/session';
import { pool } from '@/lib/db';

const ALLOWED_DATA_KINDS = new Set([
  'unpublished_drafts',
  'source_contacts',
  'article_archive',
  'audience_pii',
  'financial_records',
  'other',
]);

const ISO_COUNTRY_RE = /^[A-Z]{2}$/;

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT id, vendor, tool_name, data_residency, declared_use,
            data_kinds_exposed, data_kinds_other, notes,
            added_by, created_at, updated_at
       FROM security_external_tools
      WHERE newsroom_id = $1
      ORDER BY lower(vendor), lower(tool_name)`,
    [session.newsroomId]
  );
  return NextResponse.json({ tools: rows });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'builder' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — builder role required' }, { status: 403 });
  }

  let body: {
    vendor?: string;
    tool_name?: string;
    data_residency?: string | null;
    declared_use?: string | null;
    data_kinds_exposed?: string[];
    data_kinds_other?: string | null;
    notes?: string | null;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const validation = validateToolPayload(body, { partial: false });
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO security_external_tools
       (newsroom_id, added_by, vendor, tool_name, data_residency,
        declared_use, data_kinds_exposed, data_kinds_other, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, vendor, tool_name, data_residency, declared_use,
               data_kinds_exposed, data_kinds_other, notes,
               added_by, created_at, updated_at`,
    [
      session.newsroomId, session.userId,
      validation.fields.vendor, validation.fields.tool_name,
      validation.fields.data_residency, validation.fields.declared_use,
      validation.fields.data_kinds_exposed, validation.fields.data_kinds_other,
      validation.fields.notes,
    ]
  );
  return NextResponse.json({ tool: rows[0] }, { status: 201 });
}

// Shared validator used by POST + PATCH ([id]/route.ts).
export function validateToolPayload(body: {
  vendor?: string;
  tool_name?: string;
  data_residency?: string | null;
  declared_use?: string | null;
  data_kinds_exposed?: string[];
  data_kinds_other?: string | null;
  notes?: string | null;
}, opts: { partial: boolean }): {
  error?: string;
  fields: {
    vendor?: string;
    tool_name?: string;
    data_residency: string | null;
    declared_use: string | null;
    data_kinds_exposed?: string[];
    data_kinds_other: string | null;
    notes: string | null;
  };
} {
  const fields = {
    vendor: undefined as string | undefined,
    tool_name: undefined as string | undefined,
    data_residency: null as string | null,
    declared_use: null as string | null,
    data_kinds_exposed: undefined as string[] | undefined,
    data_kinds_other: null as string | null,
    notes: null as string | null,
  };

  const vendor = body.vendor?.trim();
  const toolName = body.tool_name?.trim();
  if (!opts.partial) {
    if (!vendor) return { error: 'vendor is required', fields };
    if (!toolName) return { error: 'tool_name is required', fields };
  }
  if (vendor !== undefined) fields.vendor = vendor;
  if (toolName !== undefined) fields.tool_name = toolName;

  if (body.data_residency !== undefined) {
    const dr = (body.data_residency ?? '').trim().toUpperCase();
    if (dr && !ISO_COUNTRY_RE.test(dr)) {
      return { error: 'data_residency must be a 2-letter ISO country code (e.g. ZA, US, EU, GB) or null', fields };
    }
    fields.data_residency = dr || null;
  }

  if (body.declared_use !== undefined) {
    const du = (body.declared_use ?? '').trim();
    fields.declared_use = du || null;
  }

  if (body.data_kinds_exposed !== undefined) {
    if (!Array.isArray(body.data_kinds_exposed)) {
      return { error: 'data_kinds_exposed must be an array of strings', fields };
    }
    const cleaned: string[] = [];
    for (const k of body.data_kinds_exposed) {
      if (typeof k !== 'string') return { error: 'data_kinds_exposed entries must be strings', fields };
      if (!ALLOWED_DATA_KINDS.has(k)) {
        return { error: `data_kinds_exposed contains unknown value "${k}". Allowed: ${[...ALLOWED_DATA_KINDS].join(', ')}`, fields };
      }
      if (!cleaned.includes(k)) cleaned.push(k);
    }
    fields.data_kinds_exposed = cleaned;
  }

  if (body.data_kinds_other !== undefined) {
    const dko = (body.data_kinds_other ?? '').trim();
    fields.data_kinds_other = dko || null;
  }

  // Consistency check: 'other' requires data_kinds_other text.
  if (
    fields.data_kinds_exposed?.includes('other') &&
    !fields.data_kinds_other &&
    !opts.partial
  ) {
    return { error: 'when data_kinds_exposed includes "other", data_kinds_other must describe what', fields };
  }

  if (body.notes !== undefined) {
    const n = (body.notes ?? '').trim();
    fields.notes = n || null;
  }

  return { fields };
}

export { ALLOWED_DATA_KINDS };
