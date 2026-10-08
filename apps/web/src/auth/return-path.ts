/** Where hosts land after signing in when no other page asked for them. */
export const defaultSignedInPath = '/dashboard';

/**
 * Accepts only a path on this site ("/dashboard?tab=sets"), never another origin ("//evil.test",
 * "https://evil.test", "/\\evil.test"), so the sign-in page cannot be used to bounce hosts away.
 */
export function safeReturnPath(requested: unknown): string {
  if (typeof requested !== 'string') return defaultSignedInPath;
  if (!requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return defaultSignedInPath;
  }
  try {
    const parsed = new URL(requested, 'http://placeholder.invalid');
    if (parsed.origin !== 'http://placeholder.invalid') return defaultSignedInPath;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultSignedInPath;
  }
}
