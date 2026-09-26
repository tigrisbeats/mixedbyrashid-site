import { getDb } from '../lib/db.mjs';

const json = (status, body) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' },
});

const requiredTables = [
  'portal_orders',
  'portal_royalty_agreements',
  'portal_project_storage',
  'portal_release_metadata',
];

const requiredOrderColumns = [
  'id',
  'user_id',
  'customer_email',
  'service',
  'payment_status',
  'project_status',
  'amount_total_cents',
  'included_revisions',
  'revision_count',
  'royalty_participation_required',
  'royalty_agreement_status',
  'created_at',
  'paid_at',
  'completed_at',
];

export default async (request) => {
  if (request.method !== 'GET') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const sql = getDb();

    const tableRows = await sql\`
      select tablename
      from pg_catalog.pg_tables
      where schemaname = 'public'
        and tablename = any(\${requiredTables})
    \`;

    const presentTables = new Set(tableRows.map((row) => row.tablename));
    const missingTables = requiredTables.filter((name) => !presentTables.has(name));

    const columnRows = await sql\`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portal_orders'
    \`;

    const presentColumns = new Set(columnRows.map((row) => row.column_name));
    const missingColumns = requiredOrderColumns.filter((name) => !presentColumns.has(name));

    const ok = missingTables.length === 0 && missingColumns.length === 0;

    return json(ok ? 200 : 503, {
      ok,
      database: true,
      schema_ready: ok,
      missing_tables: missingTables,
      missing_order_columns: missingColumns,
    });
  } catch (error) {
    console.error('portal-health', error);
    return json(503, {
      ok: false,
      database: false,
      schema_ready: false,
      error: 'Portal database health check failed.',
    });
  }
};

export const config = {
  path: '/api/portal-health',
};
