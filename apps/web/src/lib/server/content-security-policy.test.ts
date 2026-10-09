import { describe, expect, it } from 'vitest';
import { playerPageContentSecurityPolicy, realtimeConnectSources } from './content-security-policy';

const directive = (policy: string, name: string) =>
  policy.split('; ').find((entry) => entry.startsWith(`${name} `)) ?? '';

describe('player page Content Security Policy', () => {
  it('allows scripts only with the nonce, no eval in production, no framing or plugins', () => {
    const policy = playerPageContentSecurityPolicy({
      nonce: 'abc123',
      requestHost: 'localhost:3000',
      secure: false,
      development: false,
    });
    expect(directive(policy, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
    );
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('adds eval only in development and upgrades requests only over HTTPS', () => {
    const development = playerPageContentSecurityPolicy({
      nonce: 'n',
      requestHost: 'localhost:3000',
      secure: false,
      development: true,
    });
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
    const deployed = playerPageContentSecurityPolicy({
      nonce: 'n',
      requestHost: 'teckin.example.org',
      secure: true,
      configuredRealtimeUrl: 'https://teckin-prod-rt-1.calm-sea.uksouth.azurecontainerapps.io',
      development: false,
    });
    expect(deployed).toContain('upgrade-insecure-requests');
  });

  it('connects locally to the realtime server on the page host, port 2567', () => {
    expect(realtimeConnectSources({ requestHost: '192.168.1.20:3000' })).toEqual([
      'http://192.168.1.20:2567',
      'ws://192.168.1.20:2567',
    ]);
    expect(realtimeConnectSources({ requestHost: '[::1]:3000' })).toEqual([
      'http://[::1]:2567',
      'ws://[::1]:2567',
    ]);
  });

  it('allows every realtime process next to the configured entry when deployed', () => {
    const sources = realtimeConnectSources({
      requestHost: 'teckin.example.org',
      configuredRealtimeUrl: 'https://teckin-prod-rt-1.calm-sea.uksouth.azurecontainerapps.io/',
    });
    expect(sources).toContain('https://teckin-prod-rt-1.calm-sea.uksouth.azurecontainerapps.io');
    expect(sources).toContain('wss://*.calm-sea.uksouth.azurecontainerapps.io');
    expect(sources).toContain('https://*.calm-sea.uksouth.azurecontainerapps.io');
  });

  it('uses explicit connect sources when configured', () => {
    expect(
      realtimeConnectSources({
        requestHost: 'x',
        configuredRealtimeUrl: 'https://a.b.c',
        configuredConnectSources: ' https://rt.example.org  wss://rt.example.org ',
      }),
    ).toEqual(['https://rt.example.org', 'wss://rt.example.org']);
  });
});
