import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/generate': { target: 'http://localhost:8220', changeOrigin: true },
      '/health':   { target: 'http://localhost:8220', changeOrigin: true },
      '/node/execute': { target: 'http://localhost:8220', changeOrigin: true },
      '/pipeline/serialize': { target: 'http://localhost:8220', changeOrigin: true },
      '/pipeline/deserialize': { target: 'http://localhost:8220', changeOrigin: true },
      '/api/paths': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});