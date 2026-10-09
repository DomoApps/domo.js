import {
  activeBase,
  baseOf,
  blockers,
  BugCheck,
  cmp,
  JiraIssue,
  nextBetaNumber,
  NON_BUG_RESOLUTIONS,
  parse,
  pendingPublish,
  planRelease,
  planStable,
  simulatedNow,
  State,
} from '../lib';

const DAY = 86_400_000;
const NOW = new Date('2026-10-09T15:23:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

// Mirrors the real registry on 2026-10-09: 6.0.9 is latest, the beta tag is stale,
// and a few historical versions don't match the pipeline's version format.
function base(): State {
  return {
    now: NOW,
    masterVersion: '6.0.9-alpha.0',
    masterSha: 'm1',
    npm: {
      versions: ['4.1.0-beta', '4.1.0-beta-1', '4.6.0-beta.0', '6.0.4-alpha.0', '6.0.8', '6.0.9'],
      time: { created: ago(900), modified: ago(1), '6.0.8': ago(63), '6.0.9': ago(56) },
      distTags: { latest: '6.0.9', beta: '4.6.0-beta.0', alpha: '6.0.4-alpha.0' },
    },
    tags: {},
  };
}

// 6.0.10 in beta: beta.0 built from master m1, beta.1 built from m2, published `age` days ago.
function inBeta(age: number): State {
  const s = base();
  s.masterSha = 'm2';
  s.npm.versions.push('6.0.10-beta.0', '6.0.10-beta.1');
  s.npm.time['6.0.10-beta.0'] = ago(age + 3);
  s.npm.time['6.0.10-beta.1'] = ago(age);
  s.npm.distTags.beta = '6.0.10-beta.1';
  s.tags['6.0.10-beta.0'] = { sha: 'b0', parent: 'm1' };
  s.tags['6.0.10-beta.1'] = { sha: 'b1', parent: 'm2' };
  return s;
}

// 6.0.10 GA'd `age` days ago from beta.1 and is the latest dist-tag.
function released(age: number): State {
  const s = inBeta(age + 15);
  s.npm.versions.push('6.0.10');
  s.npm.time['6.0.10'] = ago(age);
  s.npm.distTags.latest = '6.0.10';
  s.tags['6.0.10'] = { sha: 'g0', parent: 'b1' };
  return s;
}

const noBugs: BugCheck = async () => [];

describe('parse', () => {
  it('parses GA and beta versions', () => {
    expect(parse('6.0.10')).toEqual({ base: '6.0.10', major: 6, minor: 0, patch: 10, beta: null });
    expect(parse('6.0.10-beta.3')).toEqual({ base: '6.0.10', major: 6, minor: 0, patch: 10, beta: 3 });
  });

  it('returns null for versions outside the pipeline format', () => {
    for (const v of ['4.1.0-beta', '4.1.0-beta-1', '6.0.4-alpha.0', 'v6.0.9', '6.0', '']) {
      expect(parse(v)).toBeNull();
    }
  });
});

describe('baseOf', () => {
  it('takes the X.Y.Z prefix of any prerelease', () => {
    expect(baseOf('6.0.9-alpha.0')).toBe('6.0.9');
    expect(baseOf('6.1.0-beta.0')).toBe('6.1.0');
    expect(baseOf('6.0.9')).toBe('6.0.9');
  });

  it('returns null when there is no X.Y.Z prefix', () => {
    expect(baseOf('latest')).toBeNull();
  });
});

describe('simulatedNow', () => {
  it('accepts an offset in days from the real clock', () => {
    expect(simulatedNow('+15d', NOW)).toEqual(new Date(NOW.getTime() + 15 * DAY));
  });

  it('accepts an ISO timestamp', () => {
    expect(simulatedNow('2026-11-01T00:00:00Z', NOW)).toEqual(new Date('2026-11-01T00:00:00Z'));
  });

  it('uses the real clock when unset', () => {
    expect(simulatedNow('', NOW)).toBe(NOW);
  });

  it('rejects anything else', () => {
    expect(() => simulatedNow('next week', NOW)).toThrow(/simulate_now/);
  });
});

describe('cmp', () => {
  it('orders numerically, with a GA above its own betas', () => {
    const sorted = ['6.0.10', '6.0.9', '6.0.10-beta.10', '6.0.10-beta.2', '6.1.0-beta.0'].sort(cmp);
    expect(sorted).toEqual(['6.0.9', '6.0.10-beta.2', '6.0.10-beta.10', '6.0.10', '6.1.0-beta.0']);
  });
});

describe('activeBase', () => {
  it('is the next patch after the highest GA', () => {
    expect(activeBase(base())).toBe('6.0.10');
  });

  it('counts GA tags that npm does not show yet', () => {
    const s = inBeta(20);
    s.tags['6.0.10'] = { sha: 'g0', parent: 'b1' };
    expect(activeBase(s)).toBe('6.0.11');
  });

  it('ignores a hand-made GA tag that does not sit on a beta tag', () => {
    const s = base();
    s.tags['7.0.0'] = { sha: 'stray', parent: 'm1' };
    expect(activeBase(s)).toBe('6.0.10');
  });

  it('honours a higher floor from master package.json', () => {
    const s = base();
    s.masterVersion = '6.1.0-beta.0';
    expect(activeBase(s)).toBe('6.1.0');
  });
});

describe('nextBetaNumber', () => {
  it('starts at 0 for a new line', () => {
    expect(nextBetaNumber('6.0.10', base())).toBe(0);
  });

  it('skips numbers that exist only as unpublished npm time entries or git tags', () => {
    const s = inBeta(1);
    s.npm.time['6.0.10-beta.4'] = ago(2); // published then unpublished: npm never reuses it
    s.tags['6.0.10-beta.6'] = { sha: 'b6', parent: 'm9' };
    expect(nextBetaNumber('6.0.10', s)).toBe(7);
  });
});

describe('pendingPublish', () => {
  it('finds a pipeline tag newer than anything on npm', () => {
    const s = inBeta(1);
    s.tags['6.0.10-beta.2'] = { sha: 'b2', parent: 'm3' };
    expect(pendingPublish(s)).toBe('6.0.10-beta.2');
  });

  it('ignores tags already on npm and old orphaned tags', () => {
    const s = inBeta(1);
    s.tags['5.0.1'] = { sha: 'x', parent: 'y' };
    expect(pendingPublish(s)).toBeNull();
  });

  it('ignores a hand-made GA tag, which publish would reject forever', () => {
    const s = inBeta(1);
    s.tags['7.0.0'] = { sha: 'stray', parent: 'm2' };
    expect(pendingPublish(s)).toBeNull();
  });

  it('ignores a version npm has seen and unpublished, since it can never be republished', () => {
    const s = inBeta(1);
    s.tags['6.0.10-beta.2'] = { sha: 'b2', parent: 'm3' };
    s.npm.time['6.0.10-beta.2'] = ago(0);
    expect(pendingPublish(s)).toBeNull();
  });
});

describe('blockers', () => {
  const since = new Date(ago(10));
  const issue = (over: Partial<JiraIssue>): JiraIssue => ({
    key: 'DOMO-1',
    created: ago(5),
    statusCategory: 'done',
    resolution: 'Done',
    ...over,
  });

  it('blocks on any unresolved bug, however old', () => {
    expect(blockers([issue({ statusCategory: 'indeterminate', created: ago(40) })], since, NON_BUG_RESOLUTIONS)).toEqual([
      'DOMO-1',
    ]);
  });

  it('blocks on a bug reported during the soak even after it is fixed', () => {
    expect(blockers([issue({ resolution: 'Fixed' })], since, NON_BUG_RESOLUTIONS)).toEqual(['DOMO-1']);
  });

  it('blocks on a done bug with no resolution reported during the soak', () => {
    expect(blockers([issue({ resolution: null })], since, NON_BUG_RESOLUTIONS)).toEqual(['DOMO-1']);
  });

  it('ignores bugs closed as not-a-bug, case-insensitively', () => {
    const closed = ['Duplicate', "won't do", "Won't Fix", 'Cannot Reproduce', 'Not a Bug'].map((resolution, i) =>
      issue({ key: `DOMO-${i}`, resolution }),
    );
    expect(blockers(closed, since, NON_BUG_RESOLUTIONS)).toEqual([]);
  });

  it('ignores bugs fixed before the soak started', () => {
    expect(blockers([issue({ created: ago(12) })], since, NON_BUG_RESOLUTIONS)).toEqual([]);
  });
});

describe('planRelease', () => {
  it('cuts 6.0.10-beta.0 on day 0, comparing against the last GA', async () => {
    expect(await planRelease(base(), noBugs)).toMatchObject({
      kind: 'beta',
      version: '6.0.10-beta.0',
      from: 'm1',
      compare: '6.0.9',
    });
  });

  it('does nothing when master is already the newest beta', async () => {
    expect(await planRelease(inBeta(3), noBugs)).toMatchObject({ kind: 'none' });
  });

  it('cuts the next beta from new master commits, comparing against the newest beta', async () => {
    const s = inBeta(3);
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({
      kind: 'beta',
      version: '6.0.10-beta.2',
      from: 'm3',
      compare: '6.0.10-beta.1',
    });
  });

  it('waits until the newest beta has soaked 14 days', async () => {
    const bugs = jest.fn(noBugs);
    const s = inBeta(14 - 1 / 24 / 60);
    expect(await planRelease(s, bugs)).toMatchObject({ kind: 'none' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('promotes the soaked beta to GA after 14 days with no bugs', async () => {
    const bugs = jest.fn(noBugs);
    const s = inBeta(14);
    expect(await planRelease(s, bugs)).toMatchObject({
      kind: 'ga',
      version: '6.0.10',
      from: 'v6.0.10-beta.1',
      compare: '6.0.10-beta.1',
    });
    expect(bugs).toHaveBeenCalledWith(
      ['ryuu.js-6.0.10', 'ryuu.js-6.0.10-beta.0', 'ryuu.js-6.0.10-beta.1'],
      new Date(s.npm.time['6.0.10-beta.1']),
    );
  });

  it('promotes to GA even when master has moved on; new commits go to the next line', async () => {
    const s = inBeta(15);
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'ga', version: '6.0.10' });
  });

  it('holds GA while a bug blocks, and still cuts betas so a fix can ship', async () => {
    const s = inBeta(20);
    const bugs: BugCheck = async () => ['DOMO-7'];
    expect(await planRelease(s, bugs)).toMatchObject({ kind: 'none', reason: expect.stringContaining('DOMO-7') });
    s.masterSha = 'm3';
    expect(await planRelease(s, bugs)).toMatchObject({ kind: 'beta', version: '6.0.10-beta.2' });
  });

  it('fails instead of cutting a beta when Jira errors while GA is due', async () => {
    const s = inBeta(20);
    s.masterSha = 'm3';
    const bugs: BugCheck = async () => {
      throw new Error('Jira returned 503');
    };
    await expect(planRelease(s, bugs)).rejects.toThrow('Jira returned 503');
  });

  it('force_ga skips the soak and the bug check', async () => {
    const bugs = jest.fn(noBugs);
    expect(await planRelease(inBeta(1), bugs, { forceGa: true })).toMatchObject({ kind: 'ga', version: '6.0.10' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('re-dispatches a pending publish before anything else', async () => {
    const s = inBeta(20);
    s.tags['6.0.10'] = { sha: 'g0', parent: 'b1' };
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'publish', version: '6.0.10' });
  });

  it('after GA, starts the next patch line from new master commits', async () => {
    const s = released(2);
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({
      kind: 'beta',
      version: '6.0.11-beta.0',
      from: 'm3',
      compare: '6.0.10',
    });
  });

  it('after GA, does nothing while master is still the commit that shipped', async () => {
    expect(await planRelease(released(2), noBugs)).toMatchObject({ kind: 'none' });
  });

  it('abandons the in-flight line when master raises the floor', async () => {
    const s = inBeta(3);
    s.masterVersion = '6.1.0-beta.0';
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'beta', version: '6.1.0-beta.0', compare: '6.0.9' });
  });
});

describe('planStable', () => {
  it('never auto-promotes an untagged GA such as 6.0.9', async () => {
    expect(await planStable(base(), noBugs)).toMatchObject({ kind: 'none' });
  });

  it('waits 30 days after GA', async () => {
    const bugs = jest.fn(noBugs);
    expect(await planStable(released(29), bugs)).toMatchObject({ kind: 'none' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('tags a GA stable after 30 bug-free days', async () => {
    const bugs = jest.fn(noBugs);
    const s = released(30);
    expect(await planStable(s, bugs)).toMatchObject({ kind: 'stable', version: '6.0.10' });
    expect(bugs).toHaveBeenCalledWith(
      ['ryuu.js-6.0.10', 'ryuu.js-6.0.10-beta.0', 'ryuu.js-6.0.10-beta.1'],
      new Date(s.npm.time['6.0.10']),
    );
  });

  it('skips a GA with bugs', async () => {
    expect(await planStable(released(40), async () => ['DOMO-9'])).toMatchObject({
      kind: 'none',
      reason: expect.stringContaining('DOMO-9'),
    });
  });

  it('does nothing when the GA is already stable', async () => {
    const s = released(40);
    s.npm.distTags.stable = '6.0.10';
    expect(await planStable(s, noBugs)).toMatchObject({ kind: 'none' });
  });

  it('picks the highest qualifying GA, skipping newer ones still soaking', async () => {
    const s = released(40);
    s.npm.versions.push('6.0.11-beta.0', '6.0.11', '6.0.12');
    s.npm.time['6.0.11'] = ago(31);
    s.npm.time['6.0.12'] = ago(5);
    s.npm.distTags.latest = '6.0.12';
    s.tags['6.0.11-beta.0'] = { sha: 'b11', parent: 'm4' };
    s.tags['6.0.11'] = { sha: 'g1', parent: 'b11' };
    s.tags['6.0.12-beta.0'] = { sha: 'b12', parent: 'm5' };
    s.tags['6.0.12'] = { sha: 'g2', parent: 'b12' };
    expect(await planStable(s, noBugs)).toMatchObject({ kind: 'stable', version: '6.0.11' });
  });

  it('ignores GA tags the pipeline did not create, such as the legacy v5.0.1', async () => {
    const s = base();
    s.npm.versions.push('5.0.1');
    s.npm.time['5.0.1'] = ago(400);
    s.tags['5.0.1'] = { sha: 'legacy', parent: 'some-commit' };
    expect(await planStable(s, noBugs)).toMatchObject({ kind: 'none' });
  });

  it('never tags a version above latest, e.g. after latest was rolled back', async () => {
    const s = released(40);
    s.npm.distTags.latest = '6.0.9';
    expect(await planStable(s, noBugs)).toMatchObject({ kind: 'none' });
  });
});
