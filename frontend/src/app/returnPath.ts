/** Only existing application pages can be a post-login destination. Never retain a fragment. */
export function returnPath(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state) || typeof state.from !== 'string') return '/dictionary';
  try {
    const url = new URL(state.from, 'http://route.local');
    const pathname = url.pathname.toLowerCase();
    if (url.origin === 'http://route.local' && ['/dictionary', '/learning', '/translator', '/profile', '/admin', '/admin/catalog'].includes(pathname)) {
      return pathname + url.search;
    }
  } catch { /* Malformed or external destinations return to the dictionary. */ }
  return '/dictionary';
}
