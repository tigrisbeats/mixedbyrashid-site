import { logout, verifyRequestOrigin } from '@netlify/identity';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(null, { status: 303, headers: { Location: '/client' } });
  }

  try {
    verifyRequestOrigin(request);
    await logout();
  } catch (error) {
    console.error('portal-logout', error?.message || error);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Cache-Control': 'no-store' },
  });
};

export const config = {
  path: '/api/portal-logout',
};
