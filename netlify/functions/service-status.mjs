import { currentCheckoutReadiness } from '../lib/checkout-readiness.mjs';

export default async (request) => Response.json(
  request.method === 'GET' ? currentCheckoutReadiness() : { error: 'Method not allowed.' },
  { status: request.method === 'GET' ? 200 : 405, headers: { 'cache-control': 'no-store' } },
);

export const config = { path: '/api/service-status' };
