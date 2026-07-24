import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the bundle works both at vite dev root and under Catalyst
// web hosting's /app/index.html path without a hardcoded prefix.
// VITE_BASE overrides it for the GitHub Pages static demo (/KSP-Dappa/);
// unset (Catalyst builds) the existing relative base is untouched.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  server: {
    port: 5173,
    // `catalyst serve` exposes the API on :3000 under /server/dappa_api
    proxy: {
      '/server': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'echarts';
          if (id.includes('node_modules/leaflet')) return 'leaflet';
          if (id.includes('node_modules/cytoscape')) return 'cytoscape';
        },
      },
    },
  },
});
