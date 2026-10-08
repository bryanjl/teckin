import { sharedPackageConfig } from '@teckin/config/eslint/base';

export default [{ ignores: ['src/generated/**'] }, ...sharedPackageConfig];
