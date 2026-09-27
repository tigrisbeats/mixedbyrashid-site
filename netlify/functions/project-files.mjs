import { getDb } from '../lib/db.mjs';
import { portalUser, assertOrderAccess, isPortalAdmin } from '../lib/auth.mjs';
import { projectSubfolders } from '../lib/storage-rules.mjs';
import { listDropboxFolder } from '../lib/dropbox.mjs';
import { projectDeliveryGate as finalDeliveryGate } from '../lib/royalty-rules.mjs';

const json = (status, body) => Response.json(body, { status });

function shapeFile(entry, role) {
  if (entry?.['.tag'] !== 'file') return null;

  return {
    id: entry.id,
    name: entry.name,
    role,
    size_bytes: entry.size || 0,
    modified_at: entry.server_modified || entry.client_modified || null,
  };
}

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

async function listRole(path, role) {
  try {
    const entries = await listDropboxFolder(path);
    return entries.map((entry) => shapeFile(entry, role)).filter(Boolean);
  } catch (error) {
    if (/not_found/i.test(error.message)) return [];
    throw error;
  }
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

    if (!orderId) return json(400, { error: 'orderId is required.' });

    const sql = getDb();
    const project = await projectRow(sql, orderId);

    if (!project) return json(404, { error: 'Project not found.' });

    assertOrderAccess(project, user);

    if (!project.project_folder_path) {
      return json(200, {
        files: {},
        storage_ready: false,
      });
    }

    const folders = projectSubfolders(project.project_folder_path);
    const gate = finalDeliveryGate({
      paymentStatus: project.payment_status,
      projectStatus: project.project_status,
      royaltyParticipationRequired: project.royalty_participation_required,
      royaltyAgreementStatus: project.royalty_agreement_status,
      clientSignedAt: project.client_signed_at,
      ownerSignedAt: project.owner_signed_at,
    });

    const roles = [
      ['source', folders.source],
      ['reference', folders.references],
      ['rough_mix', folders.roughMixes],
      ['revision', folders.revisions],
    ];

    if (isPortalAdmin(user) || gate.allowed) {
      roles.push(['final', folders.finalDelivery]);
    }

    const grouped = {};
    for (const [role, path] of roles) {
      grouped[role] = await listRole(path, role);
    }

    return json(200, {
      storage_ready: true,
      delivery: gate,
      files: grouped,
    });
  } catch (error) {
    console.error('project-files', error);
    return json(error.statusCode || 500, {
      error: error.statusCode
        ? error.message
        : 'Unable to load project files.',
    });
  }
};

export const config = {
  path: '/api/project-files',
};
