export function canDirectRetire(user) {
  return user?.role === 'admin' || Boolean(user?.permissions?.includes('engineering_retire'));
}
