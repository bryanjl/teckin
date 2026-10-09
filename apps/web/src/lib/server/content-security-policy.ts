/** What the player pages' Content Security Policy depends on, per request. */
export interface PlayerPagePolicyInput {
  /** A fresh random nonce for this response's scripts. */
  nonce: string;
  /** The `Host` the browser used (e.g. `192.168.1.20:3000`), for the local realtime address. */
  requestHost: string;
  /** True when the browser reached the site over HTTPS (directly or through Front Door). */
  secure: boolean;
  /** `NEXT_PUBLIC_REALTIME_URL`, when the deployment sets one. */
  configuredRealtimeUrl?: string | undefined;
  /** `REALTIME_CONNECT_SOURCES`: extra space-separated connect sources, replacing the derived ones. */
  configuredConnectSources?: string | undefined;
  /** Development adds `'unsafe-eval'`, which React needs there for its debugging stacks. */
  development: boolean;
}

/** Port of the local realtime server; the browser finds it on the page's host (see `lib/join.ts`). */
const localRealtimePort = 2567;

/**
 * Where the play pages may open HTTP and WebSocket connections to the realtime server.
 *
 * Deployed, the configured entry URL is only the first realtime process: a seat reservation
 * can send the phone to any sibling process (`<app>-rt-N.<environment domain>`), so the
 * policy allows every host under the entry's parent domain. Locally, the realtime server is
 * on the page's own host at port 2567.
 */
export function realtimeConnectSources(
  input: Pick<
    PlayerPagePolicyInput,
    'requestHost' | 'configuredRealtimeUrl' | 'configuredConnectSources'
  >,
): string[] {
  const configuredSources = input.configuredConnectSources?.trim();
  if (configuredSources) return configuredSources.split(/\s+/);
  const configuredUrl = input.configuredRealtimeUrl?.trim();
  if (configuredUrl) {
    const entry = new URL(configuredUrl);
    const socketScheme = entry.protocol === 'https:' ? 'wss:' : 'ws:';
    const labels = entry.host.split('.');
    // A bare host (e.g. "localhost:2567") has no siblings to allow.
    const hostPattern = labels.length > 2 ? `*.${labels.slice(1).join('.')}` : entry.host;
    return [
      `${entry.protocol}//${entry.host}`,
      `${socketScheme}//${entry.host}`,
      `${entry.protocol}//${hostPattern}`,
      `${socketScheme}//${hostPattern}`,
    ].filter((source, index, all) => all.indexOf(source) === index);
  }
  const hostname = hostnameOf(input.requestHost);
  return [`http://${hostname}:${localRealtimePort}`, `ws://${hostname}:${localRealtimePort}`];
}

/** The host name part of a `Host` header value, including IPv6 brackets. */
function hostnameOf(host: string): string {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0] || 'localhost';
}

/**
 * The strict Content Security Policy of the player pages (`/join`, `/play/*`): scripts only
 * from this site with this response's nonce (and what they load), no plugins, no framing,
 * no forms to elsewhere, connections only to this site and the realtime server. Styles
 * allow inline `style` attributes, which React renders on the server; style injection
 * cannot run code.
 */
export function playerPageContentSecurityPolicy(input: PlayerPagePolicyInput): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${input.development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${realtimeConnectSources(input).join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(input.secure ? ['upgrade-insecure-requests'] : []),
  ];
  return directives.join('; ');
}
