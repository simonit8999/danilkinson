import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
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
