import { getDb } from '../lib/db.mjs';
import {
  portalUser,
  assertOrderAccess,
  isPortalAdmin,
} from '../lib/auth.mjs';
import { finalDeliveryGate } from '../lib/royalty-rules.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function shapeProject(row) {
  const gate = finalDeliveryGate({
    royaltyParticipationRequired: row.royalty_participation_required,
    royaltyAgreementStatus: row.royalty_agreement_status,
    clientSignedAt: row.client_signed_at,
    ownerSignedAt: row.owner_signed_at,
  });

  return {
    id: row.id,
    service: row.service,
    customer_email: row.customer_email,
    payment_status: row.payment_status,
    project_status: row.project_status,
    amount_total_cents: row.amount_total_cents,
    included_revisions: row.included_revisions,
    revision_count: row.revision_count,
    created_at: row.created_at,
    paid_at: row.paid_at,
    completed_at: row.completed_at,
    royalty: {
      required: row.royalty_participation_required,
      status: row.royalty_agreement_status,
      agreement_id: row.agreement_id,
      agreement_type: row.agreement_type,
      attorney_review_status: row.attorney_review_status,
      client_signed_at: row.client_signed_at,
      owner_signed_at: row.owner_signed_at,
    },
    delivery: gate,
    storage: row.project_folder_path ? {
      project_folder_path: row.project_folder_path,
      source_request_url: row.source_request_url,
      reference_request_url: row.reference_request_url,
      cleanup_status: row.cleanup_status,
      cleanup_after: row.cleanup_after,
    } : null,
    release: {
      artist_name: row.artist_name,
      song_title: row.song_title,
      isrc: row.isrc,
      upc: row.upc,
      release_date: row.release_date,
      label_name: row.label_name,
      distributor: row.distributor,
    },
  };
}

async function detailedProject(sql, orderId) {
  const rows = await sql`
    select
      o.id,
      o.user_id,
      o.customer_email,
      o.service,
      o.payment_status,
      o.project_status,
      o.amount_total_cents,
      o.included_revisions,
      o.revision_count,
      o.royalty_participation_required,
      o.royalty_agreement_status,
      o.created_at,
      o.paid_at,
      o.completed_at,
      a.id as agreement_id,
      a.agreement_type,
      a.attorney_review_status,
      a.client_signed_at,
      a.owner_signed_at,
      s.project_folder_path,
      s.source_request_url,
      s.reference_request_url,
      s.cleanup_status,
      s.cleanup_after,
      r.artist_name,
      r.song_title,
      r.isrc,
      r.upc,
      r.release_date,
      r.label_name,
      r.distributor
    from portal_orders o
    left join portal_royalty_agreements a on a.order_id = o.id
    left join portal_project_storage s on s.order_id = o.id
    left join portal_release_metadata r on r.order_id = o.id
    where o.id = ${orderId}
    limit 1
  `;
  return rows[0];
}

async function clientProjects(sql, user) {
  await sql`
    update portal_orders
    set user_id = ${user.sub},
        updated_at = now()
    where user_id is null
      and lower(customer_email) = lower(${user.email || ''})
  `;

  return sql`
    select
      o.id,
      o.user_id,
      o.customer_email,
      o.service,
      o.payment_status,
      o.project_status,
      o.amount_total_cents,
      o.included_revisions,
      o.revision_count,
      o.royalty_participation_required,
      o.royalty_agreement_status,
      o.created_at,
      o.paid_at,
      o.completed_at,
      a.id as agreement_id,
      a.agreement_type,
      a.attorney_review_status,
      a.client_signed_at,
      a.owner_signed_at,
      s.project_folder_path,
      s.source_request_url,
      s.reference_request_url,
      s.cleanup_status,
      s.cleanup_after,
      r.artist_name,
      r.song_title,
      r.isrc,
      r.upc,
      r.release_date,
      r.label_name,
      r.distributor
    from portal_orders o
    left join portal_royalty_agreements a on a.order_id = o.id
    left join portal_project_storage s on s.order_id = o.id
    left join portal_release_metadata r on r.order_id = o.id
    where o.user_id = ${user.sub}
       or lower(o.customer_email) = lower(${user.email || ''})
    order by o.created_at desc
    limit 50
  `;
}

async function adminProjects(sql) {
  return sqm