import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    // Le projet Apps Script a ses propres tests (node:test) : voir apps-script/factures-drive
    exclude: [...configDefaults.exclude, 'apps-script/**'],
  },
});
