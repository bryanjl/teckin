import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env files itself; load the package's local .env when there is one.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` needs no database, so a missing URL only fails the commands that connect.
    url: process.env.DATABASE_URL ?? '',
  },
});
