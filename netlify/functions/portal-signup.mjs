import { signup, verifyRequestOrigin } from '@netlify/identity';

function redirect(location, status = 303) {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}

export default async (request) => {
  if (request.method !== 'POST') return redirect('/signup?error=method');

  try {
    verifyRequestOrigin(request);
    const form = await request.formData();
    const fullName = String(form.get('fullName') || '').trim();
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');

    if (!email || !password) return redirect('/signup?error=missing');

    await signup(email, password, fullName ? { full_name: fullName } : {});
    return redirect('/verify-email?sent=1');
  } catch (error) {
    console.error('portal-signup', error?.message || error);
    return redirect('/signup?error=signup');
  }
};

export const config = {
  path: '/api/portal-signup',
};
