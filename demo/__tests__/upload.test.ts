import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { currentInstance, wrongInstanceMessage } from '../upload';

describe('currentInstance', () => {
  let loginDir: string;

  const login = async (file: string, secondsAgo: number): Promise<void> => {
    const when = new Date(Date.now() - secondsAgo * 1000);
    await writeFile(path.join(loginDir, file), '{}');
    await utimes(path.join(loginDir, file), when, when);
  };

  beforeEach(async () => {
    loginDir = await mkdtemp(path.join(os.tmpdir(), 'ryuu-logins-'));
  });

  afterEach(async () => {
    await rm(loginDir, { recursive: true, force: true });
  });

  it('is the instance whose login was written most recently', async () => {
    await login('dev.dev.domo.com.json', 300);
    await login('domo.demo.domo.com.json', 10);
    await login('domo.domo.com.json', 9000);

    expect(await currentInstance(loginDir)).toBe('domo.demo.domo.com');
  });

  it('follows a re-login of an older instance', async () => {
    await login('domo.demo.domo.com.json', 300);
    await login('dev.dev.domo.com.json', 5);

    expect(await currentInstance(loginDir)).toBe('dev.dev.domo.com');
  });

  it('ignores files that are not logins', async () => {
    await login('dev.dev.domo.com.json', 300);
    await login('notes.txt', 1);

    expect(await currentInstance(loginDir)).toBe('dev.dev.domo.com');
  });

  it('is undefined when there are no logins or no login folder', async () => {
    expect(await currentInstance(loginDir)).toBeUndefined();
    expect(await currentInstance(path.join(loginDir, 'missing'))).toBeUndefined();
  });
});

describe('wrongInstanceMessage', () => {
  it('lets the publish through when the current instance is the target', () => {
    expect(wrongInstanceMessage('dev.dev.domo.com', 'dev.dev.domo.com')).toBeUndefined();
  });

  it('names both instances and the login to run when they differ', () => {
    expect(wrongInstanceMessage('domo.demo.domo.com', 'dev.dev.domo.com')).toBe(
      "The Domo CLI's current instance is domo.demo.domo.com, not dev.dev.domo.com, so domo publish would go to the wrong place. Run: domo login -i dev.dev.domo.com",
    );
  });

  it('stops when the current instance cannot be determined', () => {
    expect(wrongInstanceMessage(undefined, 'dev.dev.domo.com')).toContain('could not be determined');
  });
});
