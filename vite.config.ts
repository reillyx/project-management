import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5000,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: {
      overlay: true,
      path: '/hot/vite-hmr',
      port: 5000,
      clientPort: 5000,
      timeout: 30000,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
