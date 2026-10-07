import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DOM-backed helpers (touch controls, page guards) run against happy-dom.
    environment: 'happy-dom',
  },
});
