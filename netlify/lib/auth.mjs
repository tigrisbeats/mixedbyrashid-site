export function portalUser(context) {
  const user = context?.clientContext?.user;
  if (!user?.sub) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}

export function isPortalAdmin(user) {
  const roles = user?.app_metadata?.roles || [];
  if (Array.isArray(roles) && roles.includes('admin')) return true;

  const allowed = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowed.includes(user?.sub);
}

export function assertOrderAccess(order, user) {
  if (isPortalAdmin(user)) return true;

  const userIdMatches = order.user_id && order.user_id === user.sub;
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
