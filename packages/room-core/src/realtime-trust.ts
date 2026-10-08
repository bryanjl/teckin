import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Trust between the web app and the realtime server, which share one secret
 * (`REALTIME_SHARED_SECRET`):
 *
 * - **Host passes.** The web app checks that a signed-in host's organisation owns a game, then
 *   signs a short-lived pass for that game's room. The room admits a host connection only with
 *   a valid pass for its own room and organisation.
 * - **Signed requests.** The web app signs the launch request it sends to the realtime server,
 *   so only the web app can create rooms.
 *
 * Node only (it uses `node:crypto`); never import it from browser code.
 */

/** Shortest shared secret either app accepts. */
export const minimumSharedSecretLength = 32;

/** How long a host pass can be used to join. A reload asks for a fresh one. */
export const hostPassLifetimeMs = 5 * 60_000;

/** How old a signed request may be when it arrives (clock skew between the apps included). */
export const signedRequestMaxAgeMs = 2 * 60_000;

/** What a host pass says. */
export const hostPassClaimsSchema = z.object({
  /** The realtime room the pass opens. */
  roomId: z.string().min(1).max(64),
  /** The organisation that owns the game; the room checks it matches its own. */
  organisationId: z.string().min(1).max(64),
  /** The signed-in host it was issued to (an account id, never player data). */
  userId: z.string().min(1).max(64),
  /** Expiry, milliseconds since the epoch. */
  expiresAtMs: z.number().int().positive(),
});

/** The claims inside a host pass. */
export type HostPassClaims = z.infer<typeof hostPassClaimsSchema>;

const signedRequestEnvelopeSchema = z.object({
  payload: z.string().min(2).max(2_000_000),
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

/** The body of a signed request: a JSON payload as text and its signature. */
export type SignedRequestEnvelope = z.infer<typeof signedRequestEnvelopeSchema>;

/** Throws when a shared secret is missing or too short to be safe. */
export function assertSharedSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < minimumSharedSecretLength) {
    throw new Error(
      `REALTIME_SHARED_SECRET must be at least ${minimumSharedSecretLength} characters`,
    );
  }
}

/** HMAC-SHA256 of `message`, keyed for one purpose so a signature of one kind never passes as another. */
function sign(secret: string, purpose: string, message: string): string {
  return createHmac('sha256', secret).update(`${purpose}\n${message}`).digest('base64url');
}

function signaturesMatch(sent: string, expected: string): boolean {
  const sentBytes = Buffer.from(sent);
  const expectedBytes = Buffer.from(expected);
  return sentBytes.length === expectedBytes.length && timingSafeEqual(sentBytes, expectedBytes);
}

/**
 * Signs a host pass for one room. The web app calls this only after checking that the host's
 * organisation owns the game.
 */
export function issueHostPass(
  secret: string,
  claims: Omit<HostPassClaims, 'expiresAtMs'>,
  nowMs: number = Date.now(),
): string {
  assertSharedSecret(secret);
  const body: HostPassClaims = { ...claims, expiresAtMs: nowMs + hostPassLifetimeMs };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${encoded}.${sign(secret, 'host-pass.v1', encoded)}`;
}

/** The claims of a genuine, unexpired host pass, or `null` for anything else. */
export function verifyHostPass(
  secret: string,
  pass: string,
  nowMs: number = Date.now(),
): HostPassClaims | null {
  const [encoded, signature, extra] = pass.split('.');
  if (!encoded || !signature || extra !== undefined) return null;
  if (!signaturesMatch(signature, sign(secret, 'host-pass.v1', encoded))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const claims = hostPassClaimsSchema.safeParse(parsed);
  if (!claims.success || claims.data.expiresAtMs <= nowMs) return null;
  return claims.data;
}

/** Signs a request body for the realtime server. `purpose` names the route it is for. */
export function signRequest(
  secret: string,
  purpose: string,
  body: object,
  nowMs: number = Date.now(),
): SignedRequestEnvelope {
  assertSharedSecret(secret);
  const payload = JSON.stringify({ ...body, issuedAtMs: nowMs });
  return { payload, signature: sign(secret, `request.v1.${purpose}`, payload) };
}

/**
 * The body of a genuine, fresh signed request for `purpose`, or `null`. The caller still
 * validates the body's shape.
 */
export function verifySignedRequest(
  secret: string,
  purpose: string,
  envelope: unknown,
  nowMs: number = Date.now(),
): Record<string, unknown> | null {
  const parsed = signedRequestEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) return null;
  const { payload, signature } = parsed.data;
  if (!signaturesMatch(signature, sign(secret, `request.v1.${purpose}`, payload))) return null;
  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const issuedAtMs = (body as { issuedAtMs?: unknown }).issuedAtMs;
  if (typeof issuedAtMs !== 'number' || Math.abs(nowMs - issuedAtMs) > signedRequestMaxAgeMs) {
    return null;
  }
  return body as Record<string, unknown>;
}
