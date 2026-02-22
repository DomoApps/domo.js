import type { Plugin, ViteDevServer } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

export function domoEmulator(options?: { config?: string }): Plugin {
  return {
    name: 'domo-emulator',
    apply: 'serve',
    enforce: 'pre',

    transformIndexHtml(html: string) {
      const cfgPath =
        options?.config ?? path.join(process.cwd(), 'domo-mock.json');
      let mockConfig: object = {};
      try {
        mockConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as object;
      } catch {
        // no config file — proceed with empty config
      }

      const inject = [
        `<script>window.__DOMO_MOCK__ = ${JSON.stringify(mockConfig)};</script>`,
        `<script type="module" src="/@domo-emulator/auto.js"></script>`,
      ].join('\n');

      return html.replace(/(<head[^>]*>)/i, `$1\n${inject}`);
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        '/@domo-emulator/auto.js',
        (_req, res) => {
          res.setHeader('Content-Type', 'application/javascript');
          // __dirname is available in CJS; tsup shims it in ESM builds
          const distPath = path.resolve(__dirname, 'auto.js');
          try {
            res.end(fs.readFileSync(distPath));
          } catch {
            res.end('// @domoinc/ryuu-emulator: auto.js not found, run npm run build first');
          }
        },
      );
    },
  };
}
