/**
 * Which host sign-in methods this deployment offers, read from environment variables so that
 * nothing about providers lives in code. OAuth providers appear only when both their id and
 * secret are set; email sign-in needs either an SMTP server or (locally) link logging.
 */
export interface AuthEnvironment {
  google: { clientId: string; clientSecret: string } | null;
  microsoft: { clientId: string; clientSecret: string; issuer: string | null } | null;
  /** How magic links reach hosts, or null when email sign-in is off. */
  magicLinks: MagicLinkDelivery | null;
}

/** Where magic-link emails go. */
export type MagicLinkDelivery =
  { kind: 'smtp'; server: string; from: string } | { kind: 'log'; mailboxDirectory: string | null };

/** The sign-in methods the sign-in page shows. */
export interface SignInMethods {
  email: boolean;
  google: boolean;
  microsoft: boolean;
}

type Environment = Record<string, string | undefined>;

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Placeholder sender until Bryan picks a domain; Azure Communication Services sets the real one. */
export const defaultEmailFrom = 'Teckin <sign-in@example.invalid>';

/**
 * Reads the auth settings. Links are logged instead of emailed only when no SMTP server is set
 * and either the app runs in development or `AUTH_LOG_MAGIC_LINKS=true` says so explicitly
 * (end-to-end tests run a production build); a deployment without email simply hides it.
 */
export function readAuthEnvironment(environment: Environment = process.env): AuthEnvironment {
  const googleId = present(environment.AUTH_GOOGLE_ID);
  const googleSecret = present(environment.AUTH_GOOGLE_SECRET);
  const microsoftId = present(environment.AUTH_MICROSOFT_ENTRA_ID_ID);
  const microsoftSecret = present(environment.AUTH_MICROSOFT_ENTRA_ID_SECRET);
  const emailServer = present(environment.EMAIL_SERVER);
  const logLinks =
    environment.NODE_ENV === 'development' || environment.AUTH_LOG_MAGIC_LINKS === 'true';

  let magicLinks: MagicLinkDelivery | null = null;
  if (emailServer) {
    magicLinks = {
      kind: 'smtp',
      server: emailServer,
      from: present(environment.EMAIL_FROM) ?? defaultEmailFrom,
    };
  } else if (logLinks) {
    magicLinks = { kind: 'log', mailboxDirectory: present(environment.AUTH_DEV_MAILBOX_DIR) };
  }

  return {
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    microsoft:
      microsoftId && microsoftSecret
        ? {
            clientId: microsoftId,
            clientSecret: microsoftSecret,
            issuer: present(environment.AUTH_MICROSOFT_ENTRA_ID_ISSUER),
          }
        : null,
    magicLinks,
  };
}

/** The sign-in methods to offer, without exposing any secret to the page. */
export function signInMethods(environment: AuthEnvironment): SignInMethods {
  return {
    email: environment.magicLinks !== null,
    google: environment.google !== null,
    microsoft: environment.microsoft !== null,
  };
}
