import { getDb } from '../lib/db.mjs';
import { portalUser, isPortalAdmin } from '../lib/auth.mjs';
import { projectSubfolders } from '../lib/storage-rules.mjs';
import { createDropboxFileRequest } from '../lib/dropbox.mjs';

const json = (status, body) => Response.json(body, { status });

async function parseBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function ensureColumns(sql) {
  await sql`alter table portal_project_storage add column if not exists revision_request_id text`;
  await sql`alter table portal_project_storage add column if not exists revision_request_url text`;
  await sql`alter table portal_project_storage add column if not exists final_request_id text`;
  await sql`alter table portal_project_storage add column if not exists final_request_url text`;
}

async function storageRow(sql, orderId) {
  const rows = await sql`
    select
      o.id,
      o.service,
      s.project_folder_path,
      s.revision_request_id,
      s.revision_request_url,
      s.final_request_id,
      s.final_request_url
    from portal_orders o
    join portal_project_storage s on s.order_id = o.id
    where o.id = ${orderId}
    limit 1
  `;
  return rows[0];
}

export default async (request) => {
  try {
    if (!['GET','POST'].includes(request.method)) {
      return json(405, { error: 'Method not allowed.' });
    }

    const user = await portalUser();
    if (!isPortalAdmin(user)) return json(403, { error: 'Admin access required.' });

    const sql = getDb();
    await ensureColumns(sql);

    const url = new URL(request.url);
    const body = request.method === 'POST' ? await parseBody(request) : {};
    const orderId = body.orderId || url.searchParams.get('order_id') || url.searchParams.get('orderId');
    if (!orderId) return json(400, { error: 'orderId is required.' });

    let row = await storageRow(sql, orderId);
    if (!row) return json(404, { error: 'Project storage is not ready.' });

    if (request.method === 'GET') {
      return json(200, {
        requests: {
          revision: row.revision_request_url || null,
          final: row.final_request_url || null,
        },
      });
    }

    const role = String(body.role || '').trim();
    if (!['revision','final'].includes(role)) {
      return json(400, { error: 'role must be revision or final.' });
    }

    if (role === 'revision' && row.revision_request_url) {
      return json(200, { role, url: row.revision_request_url });
    }
    if (role === 'final' && row.final_request_url) {
      return json(200, { role, url: row.final_request_url });
    }

    const folders = projectSubfolders(row.project_folder_path);
    const destination = role === 'revision' ? folders.revisions : folders.finalDelivery;
    const title = role === 'revision'
      ? `MixedByRashid Working Versions - ${orderId.slice(0,8).toUpperCase()}`
      : `MixedByRashid Final Delivery - ${orderId.slice(0,8).toUpperCase()}`;

    const created = await createDropboxFileRequest({
      title,
      destination,
      description: role === 'revision'
        ? 'Upload mix or master working versions and revision passes for this project.'
        : 'Upload final client delivery files for this project.',
    });

    if (role === 'revision') {
      await sql`
        update portal_project_storage
        set revision_request_id = ${created.id},
            revision_request_url = ${created.url},
            updated_at = now()
        where order_id = ${orderId}
      `;
    } else {
      await sql`
        update portal_project_storage
        set final_request_id = ${created.id},
            final_request_url = ${created.url},
            updated_at = now()
        where order_id = ${orderId}
      `;
    }

    return json(200, { role, url: created.url });
  } catch (error) {
    console.error('admin-upload-request', error);
    return json(error.statusCode || 500, {
      error: error.statusCode ? error.message : 'Unable to create admin upload request.',
    });
  }
};

export const config = {
  path: '/api/admin-upload-request',
};
