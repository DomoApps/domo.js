import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEnv, insertEnvScript, parseEnv, renderEnvScript } from '../build-env';
import { ENVIRONMENTS, type RuntimeConfig } from '../ManifestOverrides';

const REAL_DEMO_DIR = path.resolve(__dirname, '..');

const runtime = Object.freeze<RuntimeConfig>({
  name: 'dev',
  sdkChannel: 'beta',
  instance: 'dev.example.com',
  datasetIds: Object.freeze({ test: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
});

describe('parseEnv', () => {
  it('reads --env <name> and --env=<name>', () => {
    expect(parseEnv(['--env', 'dev'])).toBe('dev');
    expect(parseEnv(['--env=demo'])).toBe('demo');
  });

  it.each([[[]], [['--env']], [['--env', 'prod']], [['--env=']]])('rejects %j', argv => {
    expect(() => parseEnv(argv)).toThrow('Usage: build-env --env <dev|demo>');
  });
});

describe('insertEnvScript', () => {
  it('loads env.js before the SDK loader comment', async () => {
    const html = insertEnvScript(await readFile(path.join(REAL_DEMO_DIR, 'index.html'), 'utf8'));

    const tag = html.indexOf('<script src="public-assets/env.js"></script>');
    const loader = html.indexOf('<!-- Synchronously load the chosen ryuu.js version');
    expect(tag).toBeGreaterThan(-1);
    expect(tag).toBeLessThan(loader);
  });

  it('throws when the loader comment has gone missing', () => {
    expect(() => insertEnvScript('<html></html>')).toThrow('index.html is missing the loader comment');
  });
});

describe('renderEnvScript', () => {
  it('defines window.DEMO_ENV as the runtime config', () => {
    const script = renderEnvScript(runtime);

    const prefix = 'window.DEMO_ENV = Object.freeze(';
    expect(script.startsWith(prefix)).toBe(true);
    expect(JSON.parse(script.slice(prefix.length, script.lastIndexOf(');')))).toEqual(runtime);
  });
});

describe('buildEnv', () => {
  let demoDir: string;

  beforeEach(async () => {
    demoDir = await mkdtemp(path.join(os.tmpdir(), 'build-env-'));
    await Promise.all(['manifest.json', 'index.html', 'thumbnail.png'].map(file => cp(path.join(REAL_DEMO_DIR, file), path.join(demoDir, file))));
    await mkdir(path.join(demoDir, 'assets', 'js'), { recursive: true });
    await writeFile(path.join(demoDir, 'assets', 'js', 'app.js'), '// app\n');
  });

  afterEach(async () => {
    await rm(demoDir, { recursive: true, force: true });
  });

  it('writes a stamped manifest, a page that loads env.js, the assets and the thumbnail', async () => {
    const { outDir } = await buildEnv('demo', demoDir);

    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe(ENVIRONMENTS.demo.designId);
    expect(await readFile(path.join(outDir, 'index.html'), 'utf8')).toContain('<script src="public-assets/env.js"></script>');
    expect(await readFile(path.join(outDir, 'public-assets', 'env.js'), 'utf8')).toContain('"sdkChannel": "rc"');
    expect(await readFile(path.join(outDir, 'public-assets', 'assets', 'js', 'app.js'), 'utf8')).toBe('// app\n');
    expect((await stat(path.join(outDir, 'thumbnail.png'))).isFile()).toBe(true);
  });

  it('builds with warnings rather than failing when an environment has missing ids', async () => {
    const { warnings } = await buildEnv('dev', demoDir);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every(warning => warning.startsWith('dev: '))).toBe(true);
  });

  it('never rewrites the tracked manifest', async () => {
    const before = await readFile(path.join(demoDir, 'manifest.json'), 'utf8');

    await buildEnv('dev', demoDir);

    expect(await readFile(path.join(demoDir, 'manifest.json'), 'utf8')).toBe(before);
  });

  it('replaces an earlier build of the same environment', async () => {
    const { outDir } = await buildEnv('dev', demoDir);
    await writeFile(path.join(outDir, 'stale.txt'), 'old');

    await buildEnv('dev', demoDir);

    await expect(stat(path.join(outDir, 'stale.txt'))).rejects.toThrow();
  });
});
