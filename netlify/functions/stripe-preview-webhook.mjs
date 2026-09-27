import { createStripeWebhookHandler } from '../lib/stripe-webhooks.mjs';

export default async (request) => createStripeWebhookHandler('test')(request);

export const config = { path: '/api/stripe-preview' };
