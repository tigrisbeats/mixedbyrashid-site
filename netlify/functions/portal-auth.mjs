import {
  getUser,
  login,
  logout,
  signup,
  verifyRequestOrigin,
} from '@netlify/identity';

const json = (status, body) => Response.json(body, {
  status,
  headers: { 'cache-control': 'no-store' },
});

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || null,
    roles: Array.isArray(user.roles) ? user.roles : [],
  };
}

export default async (request) => {
  try {
    if (request.method === 'GET') {
      return json(200, { user: publicUser(await getUser()) });
    }

    if (request.method !== 'POST') {
      return json(405, { error: 'Method not allowed.' });
    }

    verifyRequestOrigin(request);
    const input = await body(request);
    const action = String(input.action || '').trim();

    if (action === 'login') {
      const email = String(input.email || '').trim();
      const password = String(input.password || '');
      if (!email || !password) return json(400, { error: 'Email and password are required.' });
      const user = await login(email, password);
      return json(200, { user: publicUser(user) });
    }

    if (action === 'signup') {
      const email = String(input.email || '').trim();
      const password = String(input.password || '');
      const fullName = String(input.fullName || '').trim();
      if (!email || !password) return json(400, { error: 'Email and password are required.' });
      const user = await signup(email, password, fullName ? { full_name: fullName } : {});
      return json(201, {
        user: publicUser(user),
        confirmation_required: true,
      });
    }

    if (action === 'logout') {
      await logout();
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unsupported auth action.' });
  } catch (error) {
    console.error('portal-auth', error);
    const message = error?.message || 'Authentication request failed.';
    return json(error?.statusCode || error?.status || 400, { error: message });
  }
};

export const config = {
  path: '/api/portal-auth',
};
