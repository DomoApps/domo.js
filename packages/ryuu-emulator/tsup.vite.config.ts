import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { vite: 'src/vite.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: false,
  platform: 'node',
});
