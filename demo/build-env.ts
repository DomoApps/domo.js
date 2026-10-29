// Builds the demo app for one environment into demo/.build/<env>/, ready for `domo publish`.
//
//   npm run build:demo:dev     ryuu.js@beta, dev instance
//   npm run build:demo:demo    ryuu.js@rc, demo instance
//
// The folder holds a stamped copy of manifest.json, so publishing never rewrites the tracked manifest (the Domo CLI
// writes `id` back when it creates a design).

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyManifestOverrides,
  ENVIRONMENTS,
  runtimeConfig,
  type EnvName,
  type Manifest,
  type RuntimeConfig,
} from './ManifestOverrides';

// Compiled to <repo>/.demo-out/, so this resolves to <repo>/demo for both the compiled script and ts-jest.
const DEMO_DIR = path.resolve(__dirname, '..', 'demo');

const LOADER_MARKER = '<!-- Synchronously load the chosen ryuu.js version before any app code -->';
const ENV_SCRIPT_TAG = '<script src="public-assets/env.js"></script>';

function isEnvName(value: unknown): value is EnvName {
  return typeof value === 'string' && Object.hasOwn(ENVIRONMENTS, value);
}

/** Reads `--env <name>` or `--env=<name>`. */
export function parseEnv(argv: readonly string[]): EnvName {
  const inline = argv.find(arg => arg.startsWith('--env='))?.slice('--env='.length);
  const spaced = argv.includes('--env') ? argv[argv.indexOf('--env') + 1] : undefined;
  const value = inline ?? spaced;
  if (!isEnvName(value)) throw new Error(`Usage: build-env --env <${Object.keys(ENVIRONMENTS).join('|')}>`);
  return value;
}

/** Loads env.js before the SDK loader, so the loader can read `window.DEMO_ENV`. */
export function insertEnvScript(html: string): string {
  if (!html.includes(LOADER_MARKER)) throw new Error(`index.html is missing the loader comment: ${LOADER_MARKER}`);
  return html.replace(LOADER_MARKER, () => `${ENV_SCRIPT_TAG}\n  ${LOADER_MARKER}`);
}

export function renderEnvScript(runtime: RuntimeConfig): string {
  return `window.DEMO_ENV = Object.freeze(${JSON.stringify(runtime, null, 2)});\n`;
}

export interface BuildResult {
  readonly outDir: string;
  readonly warnings: readonly string[];
}

export async function buildEnv(env: EnvName, demoDir: string = DEMO_DIR): Promise<BuildResult> {
  const source: Manifest = JSON.parse(await readFile(path.join(demoDir, 'manifest.json'), 'utf8'));
  const { manifest, warnings } = applyManifestOverrides(source, env);
  const html = insertEnvScript(await readFile(path.join(demoDir, 'index.html'), 'utf8'));

  const outDir = path.join(demoDir, '.build', env);
  const assetsDir = path.join(outDir, 'public-assets');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(outDir, 'index.html'), html),
    writeFile(path.join(assetsDir, 'env.js'), renderEnvScript(runtimeConfig(env, manifest))),
    cp(path.join(demoDir, 'assets'), path.join(assetsDir, 'assets'), { recursive: true }),
    cp(path.join(demoDir, 'thumbnail.png'), path.join(outDir, 'thumbnail.png')),
  ]);

  return { outDir, warnings };
}

async function main(argv: readonly string[]): Promise<void> {
  const env = parseEnv(argv);
  const { instance, sdkChannel } = ENVIRONMENTS[env];
  const { outDir, warnings } = await buildEnv(env);
  const folder = path.relative(process.cwd(), outDir);

  warnings.forEach(warning => console.warn(`⚠ ${warning}`));
  console.log(`✓ Built ${env} (ryuu.js@${sdkChannel}) in ${folder}`);
  console.log(`  Publish it: domo login -i ${instance}`);
  console.log(`              cd ${folder} && domo publish`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
