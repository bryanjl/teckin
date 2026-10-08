import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from '@auth/core/adapters';
import { createHostWithPersonalOrganisation } from './accounts';
import type { PrismaClient } from './client';
import { Prisma } from './generated/prisma/client';

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/** Auth.js wants `undefined`-free objects; Prisma treats `undefined` as "leave alone" anyway. */
function definedFields<Fields extends object>(fields: Fields): Partial<Fields> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<Fields>;
}

/**
 * The account fields we store. Providers return extra token fields (Microsoft Entra sends
 * `ext_expires_in`), which would make Prisma reject the whole row, so only these are copied.
 */
function storedAccountFields(account: AdapterAccount) {
  return {
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refresh_token: account.refresh_token ?? null,
    access_token: account.access_token ?? null,
    expires_at: account.expires_at ?? null,
    token_type: account.token_type ?? null,
    scope: account.scope ?? null,
    id_token: account.id_token ?? null,
    session_state: typeof account.session_state === 'string' ? account.session_state : null,
  };
}

/**
 * The Auth.js adapter for hosts. It follows `@auth/prisma-adapter` with two differences:
 * creating a user also creates their personal organisation and owner membership in the same
 * transaction, and linked accounts store only the known token fields.
 */
export function createAuthAdapter(database: PrismaClient): Adapter {
  return {
    async createUser(user: AdapterUser): Promise<AdapterUser> {
      const created = await createHostWithPersonalOrganisation(database, {
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified,
      });
      return created.user;
    },
    getUser: (id) => database.user.findUnique({ where: { id } }),
    getUserByEmail: (email) =>
      database.user.findUnique({ where: { email: email.trim().toLowerCase() } }),
    async getUserByAccount({ provider, providerAccountId }) {
      const account = await database.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });
      return account?.user ?? null;
    },
    updateUser: ({ id, ...fields }) =>
      database.user.update({
        where: { id },
        data: definedFields({
          name: fields.name,
          email: fields.email?.trim().toLowerCase(),
          emailVerified: fields.emailVerified,
          image: fields.image,
        }),
      }),
    async deleteUser(userId) {
      await database.user.delete({ where: { id: userId } });
    },
    async linkAccount(account) {
      await database.account.create({ data: storedAccountFields(account) });
    },
    async unlinkAccount({ provider, providerAccountId }) {
      await database.account.delete({
        where: { provider_providerAccountId: { provider, providerAccountId } },
      });
    },
    async getSessionAndUser(sessionToken) {
      const found = await database.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!found) return null;
      const { user, ...session } = found;
      return {
        user,
        session: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        },
      };
    },
    async createSession(session): Promise<AdapterSession> {
      const created = await database.session.create({ data: session });
      return {
        sessionToken: created.sessionToken,
        userId: created.userId,
        expires: created.expires,
      };
    },
    async updateSession({ sessionToken, ...fields }) {
      try {
        const updated = await database.session.update({
          where: { sessionToken },
          data: definedFields({ expires: fields.expires, userId: fields.userId }),
        });
        return {
          sessionToken: updated.sessionToken,
          userId: updated.userId,
          expires: updated.expires,
        };
      } catch (error) {
        if (isRecordNotFound(error)) return null;
        throw error;
      }
    },
    async deleteSession(sessionToken) {
      // Signing out twice (two tabs) must not fail.
      await database.session.deleteMany({ where: { sessionToken } });
    },
    async createVerificationToken(token: VerificationToken) {
      const created = await database.verificationToken.create({
        data: { ...token, identifier: token.identifier.trim().toLowerCase() },
      });
      return created;
    },
    async useVerificationToken({ identifier, token }) {
      try {
        return await database.verificationToken.delete({
          where: { identifier_token: { identifier: identifier.trim().toLowerCase(), token } },
        });
      } catch (error) {
        // Already used (a second click on the link) or never issued.
        if (isRecordNotFound(error)) return null;
        throw error;
      }
    },
  };
}
