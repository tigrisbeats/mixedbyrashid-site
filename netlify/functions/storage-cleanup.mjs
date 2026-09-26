import { getDb } from '../lib/db.mjs';
import { deleteDropboxPath, dropboxRpc } from '../lib/dropbox.mjs';

export const config = {
  schedule: '0 8 * * *',
};

async function closeRequest(id) {
  if (!id) return;
  try {
    await dropboxRpc('file_requests/update', { id, open: false });
  } catch (error) {
    console.warn('Unable to close Dropbox file request', id, error.message);
  }
}

export default async (request) => {
  const scheduleEvent = await request.json().catch(() => ({}));
  const configuredDays = Number(Netlify.env.get('STORAGE_RETENTION_DAYS') || 0);

  if (!Number.isInteger(configuredDays) || configuredDays < 1 || configuredDays > 365) {
    console.log('storage-cleanup', {
      skipped: true,
      reason: 'STORAGE_RETENTION_DAYS is not configured.',
      next_run: scheduleEvent.next_run || null,
    });
    return;
  }

  const sql = getDb();

  await sql`
    update portal_project_storage s
    set retention_days = ${configuredDays},
        cleanup_after =
          coalesce(o.completed_at, o.updated_at)
          + (${configuredDays} * interval '1 day'),
        cleanup_status = 'scheduled',
        updated_at = now()
    from portal_orders o
    where o.id = s.order_id
      and o.project_status = 'complete'
      and s.cleanup_status = 'active'
      and s.cleanup_after is null
  `;

  const due = await sql`
    select s.order_id,
           s.project_folder_path,
           s.source_request_id,
           s.reference_request_id
    from portal_project_storage s
    where s.cleanup_status in ('scheduled', 'error')
      and s.cleanup_after is not null
      and s.cleanup_after <= now()
      and s.deleted_at is null
    order by s.cleanup_after asc
    limit 25
  `;

  const results = [];

  for (const project of due) {
    try {
      await closeRequest(project.source_request_id);
      await closeRequest(project.reference_request_id);

      try {
        await deleteDropboxPath(project.project_folder_path);
      } catch (error) {
        if (!/not_found/i.test(error.message)) throw error;
      }

      await sql`
        update portal_project_storage
        set cleanup_status = 'deleted',
            file_request_open = false,
            deleted_at = now(),
            last_cleanup_error = null,
            updated_at = now()
        where order_id = ${project.order_id}
      `;

      results.push({ order_id: project.order_id, status: 'deleted' });
    } catch (error) {
      await sql`
        update portal_project_storage
        set cleanup_status = 'error',
            last_cleanup_error = ${String(error.message).slice(0, 1000)},
            updated_at = now()
        where order_id = ${project.order_id}
      `;
      results.push({ order_id: project.order_id, status: 'error' });
    }
  }

  console.log('storage-cleanup', {
    next_run: scheduleEvent.next_run || null,
    processed: results.length,
    results,
  });
};
