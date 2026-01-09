import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite config for development server and IDE support.
 * Production builds use scripts/build.js for multi-format output.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@data': resolve(__dirname, 'data'),
      '@styles': resolve(__dirname, 'styles'),
      '@assets': resolve(__dirname, 'assets'),
    },
  },
  // Development server settings
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
