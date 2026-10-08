import { createAuthAdapter } from '@teckin/db';
import { getDatabaseClient } from '@teckin/db/client';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import MicrosoftEntraId from 'next-auth/providers/microsoft-entra-id';
import { readAuthEnvironment, type AuthEnvironment } from './auth/auth-environment';
import { magicLinkProvider } from './auth/magic-link';
import { allowSignInEmail } from './lib/server/platform';

/** Host sessions last 30 days and are refreshed at most once a day. */
const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

/** The providers this deployment's environment enables, in the order the page lists them. */
export function authProviders(environment: AuthEnvironment): Provider[] {
  const providers: Provider[] = [];
  if (environment.magicLinks) {
    providers.push(
      magicLinkProvider(environment.magicLinks, (email) => allowSignInEmail(email, 'send')),
    );
  }
  if (environment.google) {
    providers.push(
      Google({
        clientId: environment.google.clientId,
        clientSecret: environment.google.clientSecret,
      }),
    );
  }
  if (environment.microsoft) {
    providers.push(
      MicrosoftEntraId({
        clientId: environment.microsoft.clientId,
        clientSecret: environment.microsoft.clientSecret,
        ...(environment.microsoft.issuer ? { issuer: environment.microsoft.issuer } : {}),
      }),
    );
  }
  return providers;
}

/**
 * Auth.js for hosts (players never sign in). The config is built per request so the database
 * client and environment are read at run time, not while `next build` collects pages.
 */
function authConfig(): NextAuthConfig {
  return {
    adapter: createAuthAdapter(getDatabaseClient()),
    providers: authProviders(readAuthEnvironment()),
    session: { strategy: 'database', maxAge: sessionLifetimeSeconds, updateAge: 24 * 60 * 60 },
    pages: {
      signIn: '/sign-in',
      verifyRequest: '/sign-in/check-email',
      error: '/sign-in',
    },
    callbacks: {
      // Expose only what pages need: by default the database session (token included) and the
      // whole user row would reach `/api/auth/session`, readable by any script on the page.
      session({ session, user }) {
        return {
          expires: session.expires,
          user: {
            id: user.id,
            name: user.name ?? null,
            email: user.email,
            image: user.image ?? null,
          },
        };
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
