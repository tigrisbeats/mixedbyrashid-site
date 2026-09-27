import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { requestProjectRevision } from '../netlify/lib/review-state.mjs';
import { projectDeliveryGate } from '../netlify/lib/royalty-rules.mjs';
import { verifyPortalMutation } from '../netlify/lib/auth.mjs';
import projects from '../netlify/functions/projects.mjs';
import review from '../netlify/functions/project-review.mjs';
import storage from '../netlify/functions/project-storage.mjs';
import uploadRequest from '../netlify/functions/admin-upload-request.mjs';

test('competing revision requests consume one round and enforce payment, approval and allowance', async () => {
  const pg = new PGlite();
  try {
    for (const file of (await readdir('db')).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(await readFile(`db/${file}`, 'utf8'));
    const sql = async (strings, ...values) => (await pg.query(strings.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''), values)).rows;
    const { rows: [order] } = await pg.query("insert into portal_orders(customer_email,service,payment_status,project_status,included_revisions) values('test@example.test','mixing','paid','in_progress',2) returning id");
    const results = await Promise.allSettled([requestProjectRevision(sql, order.id), requestProjectRevision(sql, order.id)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await pg.query('select revision_count from portal_orders where id=$1', [order.id])).rows[0].revision_count, 1);
    await pg.query("update portal_orders set project_status='in_progress', payment_status='refunded' where id=$1", [order.id]);
    await assert.rejects(requestProjectRevision(sql, order.id), { statusCode: 409 });
    await pg.query("update portal_orders set payment_status='paid', mix_approved_at=now() where id=$1", [order.id]);
    await assert.rejects(requestProjectRevision(sql, order.id), { statusCode: 409 });
    await pg.query('update portal_orders set mix_approved_at=null where id=$1', [order.id]);
    assert.equal((await requestProjectRevision(sql, order.id)).revision_count, 2);
    await pg.query("update portal_orders set project_status='in_progress' where id=$1", [order.id]);
    await assert.rejects(requestProjectRevision(sql, order.id), { statusCode: 409 });
  } finally { await pg.close(); }
});

test('final delivery requires paid, uncancelled work and any required royalty agreement', () => {
  for (const paymentStatus of [undefined, 'pending', 'failed', 'refunded']) {
    assert.equal(projectDeliveryGate({ paymentStatus }).allowed, false);
  }
  assert.equal(projectDeliveryGate({ paymentStatus: 'paid', projectStatus: 'cancelled' }).allowed, false);
  assert.equal(projectDeliveryGate({ paymentStatus: 'paid', projectStatus: 'complete' }).allowed, true);
  assert.equal(projectDeliveryGate({ paymentStatus: 'paid', royaltyParticipationRequired: true, royaltyAgreementStatus: 'pending_client' }).allowed, false);
});

test('portal writes reject cross-origin requests before accessing identity, database or storage', async () => {
  for (const [handler, method] of [[projects, 'PATCH'], [review, 'POST'], [storage, 'POST'], [uploadRequest, 'POST']]) {
    for (const origin of [null, 'https://unrelated.example.test']) {
      const response = await handler(new Request('https://studio.example.test/api', {
        method, headers: origin ? { origin } : {}, body: '{}',
      }));
      assert.equal(response.status, 403);
    }
  }
  assert.doesNotThrow(() => verifyPortalMutation(new Request('https://studio.example.test/api', { method: 'POST', headers: { origin: 'https://studio.example.test' } })));
});
