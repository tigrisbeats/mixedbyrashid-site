import { login, verifyRequestOrigin } from '@netlify/identity';

function redirect(location, status = 303) {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}

export default async (request) => {
  if (request.method !== 'POST') return redirect('/login?error=method', 303);

  try {
    verifyRequestOrigin(request);
    const form = await request.formData();
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const next = String(form.get('next') || '/client');

    if (!email || !password) return redirect('/login?error=missing');

    await login(email, password);

    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/client';
    return redirect(safeNext);
  } catch (error) {
    console.error('portal-login', error?.message || error);
    return redirect('/login?error=invalid');
  }
};

export const config = {
  path: '/api/portal-login',
};
