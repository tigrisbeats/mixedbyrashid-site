export async function requestProjectRevision(sql, orderId) {
  const rows = await sql`
    update portal_orders
    set revision_count = revision_count + 1,
        project_status = 'revision',
        updated_at = now()
    where id = ${orderId}
      and service in ('mixing', 'mastering')
      and payment_status = 'paid'
      and project_status = 'in_progress'
      and mix_approved_at is null
      and revision_count < included_revisions
    returning id, revision_count
  `;
  if (!rows[0]) {
    const error = new Error('This project is not ready for another included revision. Refresh the project status.');
    error.statusCode = 409;
    throw error;
  }
  return rows[0];
}
