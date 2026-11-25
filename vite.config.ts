import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // В dev каталог и авторизация берутся с локального сервера (npm run server).
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/data': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        chunkFileNames: (chunkInfo) => (
          chunkInfo.name.includes('AdminPanel')
            ? 'assets/panel-[hash].js'
            : 'assets/[name]-[hash].js'
        ),
      },
    },
  },
});
