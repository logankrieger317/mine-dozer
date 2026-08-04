import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mine-dozer/',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        mineDozer: resolve(process.cwd(), 'index.html'),
        frontierTrail: resolve(process.cwd(), 'frontier-trail/index.html'),
      },
    },
  },
});
