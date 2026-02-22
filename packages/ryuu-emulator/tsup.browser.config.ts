import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM + CJS library outputs (for Vite plugin and Node consumers)
  {
    entry: { core: 'src/core.ts', auto: 'src/auto.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    platform: 'browser',
  },
  // IIFE bundle for direct <script> tag use (e.g. demo/index.html)
  {
    entry: { emulator: 'src/auto.ts' },
    format: ['iife'],
    globalName: 'DomoEmulatorAutoInit',
    dts: false,
    clean: false,
    platform: 'browser',
    outExtension: () => ({ js: '.js' }),
  },
]);
