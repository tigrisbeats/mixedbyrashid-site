import { getDb } from '../lib/db.mjs';
import { paymentRuntimeConfig } from '../lib/runtime-config.mjs';
import { studioDepositCents, MIN_STUDIO_HOURS, MAX_AUTO_STUDIO_HOURS } from '../lib/portal-rules.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export function createStudioDepositStatus({
  runtimeConfig = paymentRuntimeConfig,
  database = getDb,
} = {}) {
  return async (request) => {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const sessionId = new URL(request.url).searchParams.get('session_id') || '';
    const { mode } = runtimeConfig();
    if (!/^cs_(live|test)_[a-zA-Z0-9]{8,200}$/.test(sessionId) || !sessionId.startsWith(`cs_${mode}_`)) {
      return json({ error: 'A valid checkout reference is required.' }, 400);
    }
    try {
      const sql = database();
      const [order] = await sql`
        select session_hours, amount_total_cents
        from portal_orders
        where stripe_checkout_session_id = ${sessionId}
          and service = 'studio'
          and payment_status = 'paid'
          and project_status <> 'cancelled'
        limit 1
      `;
      const hours = order?.session_hours;
      if (!Number.isInteger(hours) || hours < MIN_STUDIO_HOURS || hours > MAX_AUTO_STUDIO_HOURS ||
          order.amount_total_cents < studioDepositCents(hours)) return json({ paid: false });
      return json({ paid: true, hours });
    } catch {
      return json({ error: 'Deposit verification is temporarily unavailable.' }, 503);
    }
  };
}

export default createStudioDepositStatus();
export const config = { path: '/api/studio-deposit-status' };
