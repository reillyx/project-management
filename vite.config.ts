import { defineConfig } from 'vite';

const devPort = Number(process.env.PORT) || 5000;

export default defineConfig({
  server: {
    port: devPort,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: {
      overlay: true,
      path: '/hot/vite-hmr',
      port: devPort,
      clientPort: devPort,
      timeout: 30000,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
