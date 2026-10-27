/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Several page tests render all 1,303 real records; on a slower machine they can need more than
    // the default 5 seconds, which would fail them for time rather than for behavior.
    testTimeout: 30000,
  },
});
