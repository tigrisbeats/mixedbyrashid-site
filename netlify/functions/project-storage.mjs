import { getDb } from '../lib/db.mjs';
import { portalUser, assertOrderAccess } from '../lib/auth.mjs';
import {
  clientFolderPath,
  projectFolderPath,
  projectSubfolders,
} from '../lib/storage-rules.mjs';
import {
  ensureDropboxFolder,
  createDropboxFileRequest,
} from '../lib/dropbox.mjs';

const json = (status, body) => Response.json(body, { status });

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

async function getOrder(sql, orderId) {
  const rows = await sql`
    select id, user_id, customer_email, service, status, payment_status, project_status
    from portal_orders
    where id = ${orderId}
    limit 1
  `;
  return rows[0];
}

async function getOrCreateClient(sql, { user, order, displayName }) {
  const existing = await sql`
    select *
    from portal_clients
    where (user_id = ${user.id})
       or lower(customer_email) = lower(${order.customer_email})
    order by created_at asc
    limit 1
  `;

  if (existing[0]) {
    if (!existing[0].storage_folder_path) {
      const folder = clientFolderPath({
        displayName: displayName || existing[0].display_name,
        userId: user.id,
        email: order.customer_email,
      });

      const updated = await sql`
        update portal_clients
        set storage_folder_path = ${folder},
            display_name = coalesce(${displayName || null}, display_name),
            user_id = coalesce(user_id, ${user.id}),
            updated_at = now()
        where id = ${existing[0].id}
        returning *
      `;
      return updated[0];
    }

    return existing[0];
  }

  const folder = clientFolderPath({
    displayName,
    userId: user.id,
    email: order.customer_email,
  });

  const inserted = await sql`
    insert into portal_clients
      (user_id, customer_email, display_name, storage_folder_path)
    values
      (${user.id}, ${order.customer_email}, ${displayName || null}, ${folder})
    returning *
  `;
  return inserted[0];
}

async function provisionFolders(clientFolder, projectFolder) {
  await ensureDropboxFolder('/MixedByRashid Clients');
  await ensureDropboxFolder(clientFolder);
  await ensureDropboxFolder(projectFolder);

  const subfolders = projectSubfolders(projectFolder);
  for (const path of Object.values(subfolders)) {
    await ensureDropboxFolder(path);
  }

  return subfolders;
}

async function storageForOrder(sql, orderId) {
  const rows = await sql`
    select s.*, c.display_name, c.customer_email, c.storage_folder_path
    from portal_project_storage s
    join portal_clients c on c.id = s.client_id
    where s.order_id = ${orderId}
    limit 1
  `;
  return rows[0];
}

export default async (request) => {
  try {
    if (!['GET', 'POST'].includes(request.method)) {
      return json(405, { error: 'Method not allowed.' });
    }

    const user = await portalUser();
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await parseBody(request) : {};
    const orderId =
      body.orderId ||
      url.searchParams.get('order_id') ||
      url.searchParams.get('orderId');

    if (!orderId) return json(400, { error: 'orderId is required.' });

    const sql = getDb();
    const order = await getOrder(sql, orderId);
    if (!order) return json(404, { error: 'Project not found.' });

    assertOrderAccess(order, user);

    if (request.method === 'GET') {
      const storage = await storageForOrder(sql, orderId);
      return json(200, { storage: storage || null });
    }

    if (!['mixing', 'mastering'].includes(order.service)) {
      return json(409, {
        error: 'Private audio storage is only provisioned for mixing or mastering orders.',
      });
    }

    if (order.payment_status !== 'paid') {
      return json(409, {
        error: 'Payment must be verified before project storage is created.',
      });
    }

    const displayName = String(body.displayName || '').trim() || null;
    const projectName = String(body.projectName || '').trim() || 'Audio Project';

    const client = await getOrCreateClient(sql, { user, order, displayName });
    const projectFolder = projectFolderPath({
      clientFolder: client.storage_folder_path,
      projectName,
      orderId: order.id,
    });

    let storage = await storageForOrder(sql, order.id);

    if (!storage) {
      const inserted = await sql`
        insert into portal_project_storage
          (order_id, client_id, project_folder_path)
        values
          (${order.id}, ${client.id}, ${projectFolder})
        returning *
      `;
      storage = inserted[0];
    }

    const subfolders = await provisionFolders(
      client.storage_folder_path,
      storage.project_folder_path
    );

    if (!storage.source_request_url) {
      const uploadRequest = await createDropboxFileRequest({
        title: `${projectName} - Stems & Source Files`,
        destination: subfolders.source,
        description:
          'Upload consolidated stems, source audio, rough mixes, and related project files here.',
      });

      const updated = await sql`
        update portal_project_storage
        set source_request_id = ${uploadRequest.id},
            source_request_url = ${uploadRequest.url},
            updated_at = now()
        where order_id = ${order.id}
        returning *
      `;
      storage = updated[0];
    }

    if (!storage.reference_request_url) {
      const referenceRequest = await createDropboxFileRequest({
        title: `${projectName} - Reference Tracks`,
        destination: subfolders.references,
        description: 'Upload reference tracks for this project here.',
      });

      const updated = await sql`
        update portal_project_storage
        set reference_request_id = ${referenceRequest.id},
            reference_request_url = ${referenceRequest.url},
            updated_at = now()
        where order_id = ${order.id}
        returning *
      `;
      storage = updated[0];
    }

    return json(200, {
      storage: {
        order_id: order.id,
        client_folder_path: client.storage_folder_path,
        project_folder_path: storage.project_folder_path,
        source_request_url: storage.source_request_url,
        reference_request_url: storage.reference_request_url,
        cleanup_status: storage.cleanup_status,
        cleanup_after: storage.cleanup_after,
      },
    });
  } catch (error) {
    console.error('project-storage', error);
    return json(error.statusCode || 500, {
      error: error.statusCode
        ? error.message
        : 'Unable to provision project storage.',
    });
  }
};

export const config = {
  path: '/api/project-storage',
};
