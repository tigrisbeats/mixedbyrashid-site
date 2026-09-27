import { getUser, verifyRequestOrigin } from '@netlify/identity';

export function verifyPortalMutation(request) {
  try { verifyRequestOrigin(request); }
  catch {
    const error = new Error('Request origin is not allowed.');
    error.statusCode = 403;
    throw error;
  }
}

export async function portalUser() {
  const user = await getUser();
  if (!user?.id) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

// Admin access is supplied by Netlify runtime environment allowlists.
export function isPortalAdmin(user) {
  if (Array.isArray(user?.roles) && user.roles.includes('admin')) return true;

  const allowedIds = String(Netlify.env.get('ADMIN_USER_IDS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedIds.includes(user?.id)) return true;

  const allowedEmails = String(Netlify.env.get('ADMIN_EMAILS') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return Boolean(user?.email && allowedEmails.includes(user.email.toLowerCase()));
}

export function assertOrderAccess(order, user) {
  if (isPortalAdmin(user)) return true;

  const userIdMatches = order.user_id && order.user_id === user.id;
  const emailMatches =
    order.customer_email &&
    user.email &&
    order.customer_email.toLowerCase() === user.email.toLowerCase();

  if (!userIdMatches && !emailMatches) {
    const error = new Error('You do not have access to this project.');
    error.statusCode = 403;
    throw error;
  }
  return true;
}
