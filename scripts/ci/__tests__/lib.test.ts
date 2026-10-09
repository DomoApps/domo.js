import {
  activeBase,
  baseOf,
  blockers,
  BugCheck,
  cmp,
  JiraIssue,
  nextNumber,
  NON_BUG_RESOLUTIONS,
  parse,
  pendingPublish,
  planRelease,
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

// 6.0.10 in beta: beta.0 built from master m1, beta.1 from m2, published `age` days ago.
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

// beta.1 soaked and became 6.0.10-rc.0 `age` days ago.
function inRc(age: number): State {
  const s = inBeta(age + 15);
  s.npm.versions.push('6.0.10-rc.0');
  s.npm.time['6.0.10-rc.0'] = ago(age);
  s.npm.distTags.rc = '6.0.10-rc.0';
  s.tags['6.0.10-rc.0'] = { sha: 'r0', parent: 'b1' };
  return s;
}

// rc.0 soaked and became 6.0.10 on latest `age` days ago.
function released(age: number): State {
  const s = inRc(age + 31);
  s.npm.versions.push('6.0.10');
  s.npm.time['6.0.10'] = ago(age);
  s.npm.distTags.latest = '6.0.10';
  s.tags['6.0.10'] = { sha: 'g0', parent: 'r0' };
  return s;
}

const noBugs: BugCheck = async () => [];
const LABELS_6_0_10 = ['ryuu.js-6.0.10', 'ryuu.js-6.0.10-beta.0', 'ryuu.js-6.0.10-beta.1'];

describe('parse', () => {
  it('parses GA, beta and rc versions', () => {
    expect(parse('6.0.10')).toEqual({ base: '6.0.10', major: 6, minor: 0, patch: 10, pre: null, num: null });
    expect(parse('6.0.10-beta.3')).toEqual({ base: '6.0.10', major: 6, minor: 0, patch: 10, pre: 'beta', num: 3 });
    expect(parse('6.0.10-rc.0')).toEqual({ base: '6.0.10', major: 6, minor: 0, patch: 10, pre: 'rc', num: 0 });
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
  it('orders beta < rc < GA within a version, numerically throughout', () => {
    const sorted = ['6.0.10', '6.0.9', '6.0.10-rc.0', '6.0.10-beta.10', '6.0.10-beta.2', '6.1.0-beta.0'].sort(cmp);
    expect(sorted).toEqual(['6.0.9', '6.0.10-beta.2', '6.0.10-beta.10', '6.0.10-rc.0', '6.0.10', '6.1.0-beta.0']);
  });
});

describe('activeBase', () => {
  it('is the next patch after the highest GA', () => {
    expect(activeBase(base())).toBe('6.0.10');
  });

  it('moves to the next patch as soon as a line reaches rc', () => {
    expect(activeBase(inRc(1))).toBe('6.0.11');
  });

  it('counts an rc tag that npm does not show yet', () => {
    const s = inBeta(20);
    s.tags['6.0.10-rc.0'] = { sha: 'r0', parent: 'b1' };
    expect(activeBase(s)).toBe('6.0.11');
  });

  it('ignores hand-made rc and GA tags that are not on the release chain', () => {
    const s = base();
    s.tags['6.0.10-rc.0'] = { sha: 'stray-rc', parent: 'm1' };
    s.tags['7.0.0'] = { sha: 'stray-ga', parent: 'm1' };
    expect(activeBase(s)).toBe('6.0.10');
  });

  it('honours a higher floor from master package.json', () => {
    const s = base();
    s.masterVersion = '6.1.0-beta.0';
    expect(activeBase(s)).toBe('6.1.0');
  });
});

describe('nextNumber', () => {
  it('starts at 0', () => {
    expect(nextNumber('6.0.10', 'beta', base())).toBe(0);
    expect(nextNumber('6.0.10', 'rc', inBeta(1))).toBe(0);
  });

  it('skips numbers that exist only as unpublished npm time entries or git tags', () => {
    const s = inBeta(1);
    s.npm.time['6.0.10-beta.4'] = ago(2); // published then unpublished: npm never reuses it
    s.tags['6.0.10-beta.6'] = { sha: 'b6', parent: 'm9' };
    expect(nextNumber('6.0.10', 'beta', s)).toBe(7);
  });
});

describe('pendingPublish', () => {
  it('finds a pipeline tag newer than anything on npm', () => {
    const s = inBeta(1);
    s.tags['6.0.10-beta.2'] = { sha: 'b2', parent: 'm3' };
    expect(pendingPublish(s)).toBe('6.0.10-beta.2');
  });

  it('finds an rc tag that has not been published', () => {
    const s = inBeta(20);
    s.tags['6.0.10-rc.0'] = { sha: 'r0', parent: 'b1' };
    expect(pendingPublish(s)).toBe('6.0.10-rc.0');
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

  it('ignores a GA tag sitting on a hand-made rc that is not on a beta', () => {
    const s = base();
    s.tags['6.0.10-rc.0'] = { sha: 'stray-rc', parent: 'm1' };
    s.tags['6.0.10'] = { sha: 'stray-ga', parent: 'stray-rc' };
    expect(pendingPublish(s)).toBeNull();
    expect(activeBase(s)).toBe('6.0.10');
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

describe('planRelease: beta', () => {
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

  it('re-dispatches a pending publish before anything else', async () => {
    const s = inBeta(20);
    s.tags['6.0.10-rc.0'] = { sha: 'r0', parent: 'b1' };
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'publish', version: '6.0.10-rc.0' });
  });

  it('abandons the in-flight line when master raises the floor', async () => {
    const s = inBeta(3);
    s.masterVersion = '6.1.0-beta.0';
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'beta', version: '6.1.0-beta.0', compare: '6.0.9' });
  });
});

describe('planRelease: beta → rc after 14 days', () => {
  it('waits until the newest beta has soaked 14 days', async () => {
    const bugs = jest.fn(noBugs);
    expect(await planRelease(inBeta(14 - 1 / 24 / 60), bugs)).toMatchObject({ kind: 'none' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('promotes the soaked beta to rc after 14 days with no bugs', async () => {
    const bugs = jest.fn(noBugs);
    const s = inBeta(14);
    expect(await planRelease(s, bugs)).toMatchObject({
      kind: 'rc',
      version: '6.0.10-rc.0',
      from: 'v6.0.10-beta.1',
      compare: '6.0.10-beta.1',
    });
    expect(bugs).toHaveBeenCalledWith(LABELS_6_0_10, new Date(s.npm.time['6.0.10-beta.1']));
  });

  it('promotes to rc even when master has moved on; new commits go to the next line', async () => {
    const s = inBeta(15);
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'rc', version: '6.0.10-rc.0' });
  });

  it('holds the rc while a bug blocks, and still cuts betas so a fix can ship', async () => {
    const s = inBeta(20);
    const bugs: BugCheck = async () => ['DOMO-7'];
    expect(await planRelease(s, bugs)).toMatchObject({ kind: 'none', reason: expect.stringContaining('DOMO-7') });
    s.masterSha = 'm3';
    expect(await planRelease(s, bugs)).toMatchObject({ kind: 'beta', version: '6.0.10-beta.2' });
  });

  it('fails instead of cutting a beta when Jira errors while the rc is due', async () => {
    const s = inBeta(20);
    s.masterSha = 'm3';
    const bugs: BugCheck = async () => {
      throw new Error('Jira returned 503');
    };
    await expect(planRelease(s, bugs)).rejects.toThrow('Jira returned 503');
  });

  it('force_rc skips the soak and the bug check', async () => {
    const bugs = jest.fn(noBugs);
    expect(await planRelease(inBeta(1), bugs, { forceRc: true })).toMatchObject({ kind: 'rc', version: '6.0.10-rc.0' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('force_rc with no beta to promote does nothing rather than cutting a beta', async () => {
    expect(await planRelease(base(), noBugs, { forceRc: true })).toMatchObject({
      kind: 'none',
      reason: expect.stringContaining('force_rc'),
    });
  });
});

describe('planRelease: after rc, the next line', () => {
  it('starts the next patch line from new master commits, comparing against the rc', async () => {
    const s = inRc(2);
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({
      kind: 'beta',
      version: '6.0.11-beta.0',
      from: 'm3',
      compare: '6.0.10-rc.0',
    });
  });

  it('does nothing while master is still the commit that became the rc', async () => {
    expect(await planRelease(inRc(2), noBugs)).toMatchObject({ kind: 'none' });
  });
});

describe('planRelease: rc → latest after 30 days', () => {
  it('waits until the rc has soaked 30 days', async () => {
    const bugs = jest.fn(noBugs);
    expect(await planRelease(inRc(29), bugs)).toMatchObject({ kind: 'none' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('releases the rc as latest after 30 bug-free days', async () => {
    const bugs = jest.fn(noBugs);
    const s = inRc(30);
    expect(await planRelease(s, bugs)).toMatchObject({
      kind: 'ga',
      version: '6.0.10',
      from: 'v6.0.10-rc.0',
      compare: '6.0.10-rc.0',
    });
    expect(bugs).toHaveBeenCalledWith([...LABELS_6_0_10, 'ryuu.js-6.0.10-rc.0'], new Date(s.npm.time['6.0.10-rc.0']));
  });

  it('holds the GA while a bug blocks, and the next line keeps shipping betas', async () => {
    const s = inRc(40);
    s.masterSha = 'm3';
    expect(await planRelease(s, async () => ['DOMO-9'])).toMatchObject({ kind: 'beta', version: '6.0.11-beta.0' });
  });

  it('fails instead of moving on when Jira errors while the GA is due', async () => {
    const s = inRc(40);
    s.masterSha = 'm3';
    await expect(
      planRelease(s, async () => {
        throw new Error('Jira returned 401');
      }),
    ).rejects.toThrow('Jira returned 401');
  });

  it('releases the highest ripe rc, skipping a newer one still soaking', async () => {
    const s = inRc(40);
    s.npm.versions.push('6.0.11-beta.0', '6.0.11-rc.0', '6.0.12-beta.0', '6.0.12-rc.0');
    s.npm.time['6.0.11-beta.0'] = ago(60);
    s.npm.time['6.0.11-rc.0'] = ago(31);
    s.npm.time['6.0.12-beta.0'] = ago(30);
    s.npm.time['6.0.12-rc.0'] = ago(5);
    s.tags['6.0.11-beta.0'] = { sha: 'b11', parent: 'm4' };
    s.tags['6.0.11-rc.0'] = { sha: 'r11', parent: 'b11' };
    s.tags['6.0.12-beta.0'] = { sha: 'b12', parent: 'm5' };
    s.tags['6.0.12-rc.0'] = { sha: 'r12', parent: 'b12' };
    s.masterSha = 'm5';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'ga', version: '6.0.11', from: 'v6.0.11-rc.0' });
  });

  it('never releases a version at or below latest', async () => {
    const s = inRc(40);
    s.npm.distTags.latest = '6.0.10';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'none' });
  });

  it('ignores an rc tag that is not on a beta tag', async () => {
    const s = inRc(40);
    s.tags['6.0.10-rc.0'] = { sha: 'r0', parent: 'm2' };
    expect(await planRelease(s, noBugs)).not.toMatchObject({ kind: 'ga' });
  });

  it('force_ga releases the newest rc now, skipping the soak and the bug check', async () => {
    const bugs = jest.fn(noBugs);
    expect(await planRelease(inRc(1), bugs, { forceGa: true })).toMatchObject({ kind: 'ga', version: '6.0.10' });
    expect(bugs).not.toHaveBeenCalled();
  });

  it('force_ga with no rc to release does nothing', async () => {
    expect(await planRelease(inBeta(3), noBugs, { forceGa: true })).toMatchObject({
      kind: 'none',
      reason: expect.stringContaining('force_ga'),
    });
  });

  it('after the GA, master unchanged means nothing to do', async () => {
    expect(await planRelease(released(2), noBugs)).toMatchObject({ kind: 'none' });
  });

  it('after the GA, new commits start 6.0.11', async () => {
    const s = released(2);
    s.masterSha = 'm3';
    expect(await planRelease(s, noBugs)).toMatchObject({ kind: 'beta', version: '6.0.11-beta.0', compare: '6.0.10' });
  });
});
