import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import Stripe from 'stripe';
import { createStripeWebhookHandler } from '../netlify/lib/stripe-webhooks.mjs';
import { handleStripeCheckoutEvent } from '../netlify/lib/stripe-orders.mjs';

function event(overrides = {}, live = false) {
  return { id: `evt_${randomUUID()}`, type: 'checkout.session.completed', livemode: live,
    data: { object: { object: 'checkout.session', id: `cs_${randomUUID()}`, mode: 'payment',
      livemode: live, payment_status: 'paid', currency: 'usd', amount_total: 2000,
      customer_email: 'client@example.test', metadata: { service: 'mastering', quantity: '1' }, ...overrides } } };
}

test('signed checkout fulfillment respects paid state, receipts, duplicates and refunds', async () => {
  const pg = new PGlite();
  try {
    for (const file of (await readdir('db')).filter((f) => f.endsWith('.sql')).sort()) {
      await pg.exec(await readFile(`db/${file}`, 'utf8'));
    }
    const sql = async (strings, ...values) => (await pg.query(strings.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''), values)).rows;
    const secret = `whsec_${randomUUID()}`;
    const handler = createStripeWebhookHandler('test', {
      runtimeConfig: () => ({ context: 'deploy-preview', mode: 'test', webhookEnabled: true, webhookConfigured: true, signingSecret: secret }),
      processEvent: (value, mode) => handleStripeCheckoutEvent(value, mode, sql),
    });
    const send = async (value) => {
      const payload = JSON.stringify(value);
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      return handler(new Request('https://preview.example.test/api/stripe-preview', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
    };
    const receipt = event({ payment_status: 'unpaid' });
    assert.equal((await send(receipt)).status, 200);
    assert.equal((await pg.query('select * from portal_orders')).rows.length, 0);
    receipt.type = 'checkout.session.async_payment_succeeded';
    receipt.data.object.payment_status = 'paid';
    assert.equal((await send(receipt)).status, 200);
    assert.equal((await send(receipt)).status, 200);
    const orders = (await pg.query('select * from portal_orders')).rows;
    assert.equal(orders.length, 1);
    assert.equal(orders[0].payment_status, 'paid');
    assert.equal(orders[0].amount_total_cents, 2000);
    await pg.query("update portal_orders set payment_status='refunded', project_status='cancelled' where id=$1", [orders[0].id]);
    assert.equal((await send(receipt)).status, 200);
    assert.equal((await pg.query('select payment_status from portal_orders')).rows[0].payment_status, 'refunded');
    assert.equal((await send(event({}, true))).status, 400);
    assert.equal((await send(event({ currency: 'eur' }))).status, 500);
    assert.equal((await send(event({ amount_total: -1 }))).status, 500);
    assert.equal((await pg.query('select * from portal_orders')).rows.length, 1);
  } finally { await pg.close(); }
});

test('webhooks reject tampering and wrong modes; processing failures remain retryable', async () => {
  const secret = `whsec_${randomUUID()}`;
  let called = 0;
  const handler = createStripeWebhookHandler('live', {
    runtimeConfig: () => ({ context: 'production', mode: 'live', webhookEnabled: true, webhookConfigured: true, signingSecret: secret }),
    processEvent: async () => { called++; throw new Error('Database unavailable'); },
  });
  const payload = JSON.stringify(event({}, true));
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const request = (body) => new Request('https://example.test/api/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': signature } });
  assert.equal((await handler(request(`${payload} `))).status, 400);
  assert.equal(called, 0);
  assert.equal((await handler(request(payload))).status, 500);
  assert.equal(called, 1);
});
