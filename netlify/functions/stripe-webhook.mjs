import { createStripeWebhookHandler } from '../lib/stripe-webhooks.mjs';

export default async (request) => createStripeWebhookHandler('live')(request);

export const config = { path: '/api/stripe-webhook' };
