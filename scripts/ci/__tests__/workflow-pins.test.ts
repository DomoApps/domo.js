import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// DOMO-505019: workflows reference actions by full commit SHA, never by a tag or branch that can be moved.
// The trailing "# vX.Y.Z" comment names the release and is what Dependabot reads to propose the next bump.
const WORKFLOWS_DIR = path.resolve(__dirname, '../../../.github/workflows');

const references = Object.freeze(
  readdirSync(WORKFLOWS_DIR)
    .filter((file) => file.endsWith('.yml'))
    .flatMap((file) =>
      readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')
        .split('\n')
        .map((line, index) => Object.freeze({ at: `${file}:${index + 1}`, text: line.trim() }))
        .filter(({ text }) => /^(?:-\s+)?uses:/.test(text)),
    ),
);

describe('workflows: action references', () => {
  it('finds the references it is meant to check', () => {
    expect(references.length).toBeGreaterThan(0);
  });

  it.each(references)('$at pins a full commit SHA with a release comment', ({ text }) => {
    expect(text).toMatch(/^(?:-\s+)?uses:\s+\S+@[0-9a-f]{40}\s+#\s+v\d+\.\d+\.\d+$/);
  });
});

describe('publish.yml: the npm bootstrap', () => {
  it('installs an exact npm version, since the publish job holds the OIDC token', () => {
    const publish = readFileSync(path.join(WORKFLOWS_DIR, 'publish.yml'), 'utf8');
    expect(/npm install -g npm@(\S+)/.exec(publish)?.[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
