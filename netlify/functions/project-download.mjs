import { getDb } from '../lib/db.mjs';
import { portalUser, assertOrderAccess, isPortalAdmin } from '../lib/auth.mjs';
import { projectSubfolders } from '../lib/storage-rules.mjs';
import {
  listDropboxFolder,
  getDropboxTemporaryLink,
} from '../lib/dropbox.mjs';
import { projectDeliveryGate as finalDeliveryGate } from '../lib/royalty-rules.mjs';

const json = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function projectRow(sql, orderId) {
  const rows = await sql`
    select
      o.id,
      o.user_id,
      o.customer_email,
      o.payment_status,
      o.project_status,
      o.royalty_participation_required,
      o.royalty_agreement_status,
      a.client_signed_at,
      a.owner_signed_at,
      s.project_folder_path
    from portal_orders o
    left join portal_royalty_agreements a on a.order_id = o.id
    left join portal_project_storage s on s.order_id = o.id
    where o.id = ${orderId}
    limit 1
  `;

  return rows[0];
}

async function findAllowedFile({ project, user, fileId }) {
  const folders = projectSubfolders(project.project_folder_path);
  const gate = finalDeliveryGate({
    paymentStatus: project.payment_status,
    projectStatus: project.project_status,
    royaltyParticipationRequired: project.royalty_participation_required,
    royaltyAgreementStatus: project.royalty_agreement_status,
    clientSignedAt: project.client_signed_at,
    ownerSignedAt: project.owner_signed_at,
  });

  const paths = [
    folders.source,
    folders.references,
    folders.roughMixes,
    folders.revisions,
  ];

  if (isPortalAdmin(user) || gate.allowed) {
    paths.push(folders.finalDelivery);
  }

  for (const path of paths) {
    let entries = [];

    try {
      entries = await listDropboxFolder(path);
    } catch (error) {
      if (/not_found/i.test(error.message)) continue;
      throw error;
    }

    const match = entries.find(
      (entry) => entry?.['.tag'] === 'file' && entry.id === fileId
    );

    if (match) return { entry: match, gate };
  }

  return { entry: null, gate };
}

export default async (request) => {
  try {
    if (request.method !== 'GET') {
      return json(405, { error: 'Method not allowed.' });
    }

    const user = await portalUser();
    const url = new URL(request.url);
    const orderId =
      url.searchParams.get('order_id') ||
      url.searchParams.get('orderId');
    const fileId =
      url.searchParams.get('file_id') ||
      url.searchParams.get('fileId');

    if (!orderId || !fileId) {
      return json(400, { error: 'orderId and fileId are required.' });
    }

    if (!String(fileId).startsWith('id:')) {
      return json(400, { error: 'Invalid Dropbox file id.' });
    }

    const sql = getDb();
    const project = await projectRow(sql, orderId);

    if (!project) return json(404, { error: 'Project not found.' });

    assertOrderAccess(project, user);

    if (!project.project_folder_path) {
      return json(404, { error: 'Project storage is not ready.' });
    }

    const { entry, gate } = await findAllowedFile({
      project,
      user,
      fileId,
    });

    if (!entry) {
      return json(404, {
        error: gate.allowed
          ? 'File not found in this project.'
          : 'File not found or final delivery is still locked.',
      });
    }

    const temporary = await getDropboxTemporaryLink(entry.id);

    return json(200, {
      file: {
        id: entry.id,
        name: entry.name,
        size_bytes: entry.size || 0,
      },
      expires_in_hours: 4,
      url: temporary.link,
    });
  } catch (error) {
    console.error('project-download', error);
    return json(error.statusCode || 500, {
      error: error.statusCode
        ? error.message
        : 'Unable to create download link.',
    });
  }
};

export const config = {
  path: '/api/project-download',
};
