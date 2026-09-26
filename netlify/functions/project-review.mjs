import { getDb } from '../lib/db.mjs';
import { portalUser, assertOrderAccess, isPortalAdmin } from '../lib/auth.mjs';
import {
  normalizeTimestampMs,
  normalizeReviewNote,
  normalizeVersionKey,
  assertRevisionAvailable,
  canApproveMix,
  revisionAvailability,
} from '../lib/review-rules.mjs';

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
    select
      id,
      user_id,
      customer_email,
      service,
      payment_status,
      project_status,
      included_revisions,
      revision_count,
      mix_approved_at,
      mix_approved_version_key,
      review_reopened_at
    from portal_orders
    where id = ${orderId}
    limit 1
  `;
  return rows[0];
}

async function getNotes(sql, orderId) {
  return sql`
    select
      id,
      version_key,
      timestamp_ms,
      note,
      created_by_admin,
      created_at,
      resolved_at
    from portal_review_notes
    where order_id = ${orderId}
    order by created_at asc
    limit 500
  `;
}

function shapeReview(order, notes) {
  return {
    approval: {
      approved_at: order.mix_approved_at,
      version_key: order.mix_approved_version_key,
      reopened_at: order.review_reopened_at,
    },
    revisions: revisionAvailability({
      includedRevisions: order.included_revisions,
      revisionCount: order.revision_count,
    }),
    notes,
  };
}

export default async (request) => {
  try {
    if (!['GET', 'POST'].includes(request.method)) {
      return json(405, { error: 'Method not allowed.' });
    }

    const user = await portalUser();
    const admin = isPortalAdmin(user);
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await parseBody(request) : {};
    const orderId = body.orderId || url.searchParams.get('order_id') || url.searchParams.get('orderId');

    if (!orderId) return json(400, { error: 'orderId is required.' });

    const sql = getDb();
    let order = await getOrder(sql, orderId);
    if (!order) return json(404, { error: 'Project not found.' });
    assertOrderAccess(order, user);

    if (request.method === 'POST') {
      const action = String(body.action || '').trim();

      if (action === 'add_note') {
        if (order.mix_approved_at && !admin) {
          return json(409, { error: 'This mix is approved. Ask MixedByRashid to reopen review before adding more notes.' });
        }

        const versionKey = normalizeVersionKey(body.versionKey);
        const timestampMs = normalizeTimestampMs(body.timestampMs);
        const note = normalizeReviewNote(body.note);

        await sql`
          insert into portal_review_notes
            (order_id, user_id, created_by_admin, version_key, timestamp_ms, note)
          values
            (${orderId}, ${user.id}, ${admin}, ${versionKey}, ${timestampMs}, ${note})
        `;
      } else if (action === 'request_revision') {
        if (admin) return json(403, { error: 'Revision requests are client actions.' });
        if (order.mix_approved_at) return json(409, { error: 'This mix is already approved.' });

        assertRevisionAvailable({
          includedRevisions: order.included_revisions,
          revisionCount: order.revision_count,
        });

        const updated = await sql`
          update portal_orders
          set revision_count = revision_count + 1,
              project_status = 'revision',
              updated_at = now()
          where id = ${orderId}
          returning id
        `;
        if (!updated[0]) return json(404, { error: 'Project not found.' });
      } else if (action === 'approve_final') {
        if (admin) return json(403, { error: 'Final mix approval is a client action.' });
        const versionKey = normalizeVersionKey(body.versionKey);

        if (!canApproveMix({
          service: order.service,
          paymentStatus: order.payment_status,
          versionKey,
        })) {
          return json(409, { error: 'This project is not ready for mix approval.' });
        }

        await sql`
          update portal_orders
          set mix_approved_at = now(),
              mix_approved_version_key = ${versionKey},
              updated_at = now()
          where id = ${orderId}
        `;
      } else if (action === 'reopen_review') {
        if (!admin) return json(403, { error: 'Admin access required.' });
        await sql`
          update portal_orders
          set mix_approved_at = null,
              mix_approved_version_key = null,
              review_reopened_at = now(),
              updated_at = now()
          where id = ${orderId}
        `;
      } else if (action === 'resolve_note') {
        if (!admin) return json(403, { error: 'Admin access required.' });
        const noteId = String(body.noteId || '').trim();
        if (!noteId) return json(400, { error: 'noteId is required.' });
        await sql`
          update portal_review_notes
          set resolved_at = coalesce(resolved_at, now())
          where id = ${noteId} and order_id = ${orderId}
        `;
      } else {
        return json(400, { error: 'Unsupported review action.' });
      }

      order = await getOrder(sql, orderId);
    }

    const notes = await getNotes(sql, orderId);
    return json(200, { review: shapeReview(order, notes) });
  } catch (error) {
    console.error('project-review', error);
    return json(error.statusCode || 500, {
      error: error.statusCode ? error.message : 'Unable to update project review.',
    });
  }
};

export const config = {
  path: '/api/project-review',
};
