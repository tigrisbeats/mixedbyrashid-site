import { getUser } from '@netlify/identity';

export async function portalUser() {
  const user = await getUser();
  if (!user?.id) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

export function isPortalAdmin(user) {
  if (Array.isArray(user?.roles) && user.roles.includes('admin')) return true;

  const allowed = String(Netlify.env.get('ADMIN_USER_IDS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowed.includes(user?.id);
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
