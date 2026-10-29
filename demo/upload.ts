// Builds one environment and publishes it with the Domo CLI.
//
//   npm run upload:dev     ryuu.js@beta, dev instance
//   npm run upload:demo    ryuu.js@rc, demo instance
//
// `domo publish` has no --instance flag: it goes to whichever instance was logged into most recently. So this
// refuses to publish unless that instance is the environment's, and prints the `domo login` to run instead.

import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEnv, parseEnv } from './build-env';
import { ENVIRONMENTS } from './ManifestOverrides';

/** The Domo CLI keeps one `<instance>.json` per login here. Only the file names and times are read, never the tokens. */
const LOGIN_DIR = path.join(os.homedir(), '.config', 'configstore', 'ryuu');

/**
 * The instance `domo publish` will use. The CLI treats the most recently written login file as the current one
 * (checked against ryuu 5.1.0), and a login file is named after its instance.
 *
 * @returns Undefined when there are no logins or the folder cannot be read.
 */
export async function currentInstance(loginDir: string = LOGIN_DIR): Promise<string | undefined> {
  let names: string[];
  try {
    names = await readdir(loginDir);
  } catch {
    return undefined;
  }

  const logins = await Promise.all(
    names
      .filter(name => name.endsWith('.json'))
      .map(async name => ({ instance: path.basename(name, '.json'), written: (await stat(path.join(loginDir, name))).mtimeMs })),
  );
  const newest = logins.reduce<(typeof logins)[number] | undefined>(
    (best, login) => (best && best.written > login.written ? best : login),
    undefined,
  );
  return newest?.instance;
}

/** The message to stop with, or undefined when `domo publish` would go to `target`. */
export function wrongInstanceMessage(current: string | undefined, target: string): string | undefined {
  if (current === target) return undefined;
  const now = current ? `is ${current}` : 'could not be determined';
  return `The Domo CLI's current instance ${now}, not ${target}, so domo publish would go to the wrong place. Run: domo login -i ${target}`;
}

function run(command: string, args: readonly string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', error =>
      reject(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error('The Domo CLI is not installed or not on PATH. Install it with: npm install -g ryuu')
          : error,
      ),
    );
    child.on('close', code => resolve(code ?? 1));
  });
}

async function main(argv: readonly string[]): Promise<void> {
  const env = parseEnv(argv);
  const { instance, sdkChannel } = ENVIRONMENTS[env];

  const mismatch = wrongInstanceMessage(await currentInstance(), instance);
  if (mismatch) throw new Error(mismatch);

  const { outDir, warnings } = await buildEnv(env);
  warnings.forEach(warning => console.warn(`⚠ ${warning}`));

  console.log(`Publishing ${env} (ryuu.js@${sdkChannel}) to ${instance} from ${path.relative(process.cwd(), outDir)}`);
  const code = await run('domo', ['publish'], outDir);
  if (code !== 0) throw new Error(`domo publish exited with code ${code}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
