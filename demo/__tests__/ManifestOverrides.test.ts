import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyManifestOverrides,
  ENVIRONMENTS,
  runtimeConfig,
  type EnvironmentConfig,
  type Manifest,
} from '../ManifestOverrides';

const deepFreeze = <T>(value: T): T => {
  Object.values(value as object)
    .filter(child => typeof child === 'object' && child !== null)
    .forEach(child => deepFreeze(child));
  return Object.freeze(value);
};

const OLD_DATASET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_DATASET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NEW_MODEL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NEW_PACKAGE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DESIGN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PROXY = '99999999-9999-4999-8999-999999999999';

const manifest = deepFreeze<Manifest>({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  name: 'Test App',
  description: 'old description',
  datasetsMapping: [{ alias: 'test', dataSetId: OLD_DATASET, fields: [{ alias: 'id', columnName: 'id' }] }],
  workflowMapping: [{ alias: 'testWorkflow', parameters: [] }],
  packageMapping: [{ alias: 'awesomeFunction', parameters: [], output: { alias: 'sum', type: 'number' } }],
  collectionsMapping: [{ name: 'SanityTest' }],
});

const complete = deepFreeze<EnvironmentConfig>({
  designId: DESIGN,
  instance: 'dev.example.com',
  sdkChannel: 'beta',
  description: 'new description',
  datasets: { test: NEW_DATASET },
  workflows: { testWorkflow: NEW_MODEL },
  packages: { awesomeFunction: NEW_PACKAGE },
});

const noOverrides = deepFreeze<EnvironmentConfig>({
  designId: DESIGN,
  instance: 'dev.example.com',
  sdkChannel: 'beta',
  description: 'new description',
});

const realManifest: Manifest = JSON.parse(readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

describe('applyManifestOverrides', () => {
  it('stamps the design id, the description and each mapping id by alias', () => {
    const result = applyManifestOverrides(manifest, 'dev', complete);

    expect(result.manifest.id).toBe(DESIGN);
    expect(result.manifest.description).toBe('new description');
    expect(result.manifest.datasetsMapping).toEqual([
      { alias: 'test', dataSetId: NEW_DATASET, fields: [{ alias: 'id', columnName: 'id' }] },
    ]);
    expect(result.manifest.workflowMapping).toEqual([{ alias: 'testWorkflow', parameters: [], modelId: NEW_MODEL }]);
    expect(result.manifest.packageMapping).toEqual([
      { alias: 'awesomeFunction', parameters: [], output: { alias: 'sum', type: 'number' }, packageId: NEW_PACKAGE },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('leaves every other manifest key as it was', () => {
    const result = applyManifestOverrides(manifest, 'dev', complete);

    expect(result.manifest.name).toBe('Test App');
    expect(result.manifest.collectionsMapping).toEqual([{ name: 'SanityTest' }]);
  });

  it('does not modify the manifest it is given', () => {
    const before = structuredClone(manifest);

    const result = applyManifestOverrides(manifest, 'dev', complete);

    expect(manifest).toEqual(before);
    expect(result.manifest).not.toBe(manifest);
    expect(result.manifest.datasetsMapping).not.toBe(manifest.datasetsMapping);
  });

  it('warns instead of throwing when a mapping has no override, and keeps the manifest value', () => {
    const noDatasetOverride = deepFreeze<EnvironmentConfig>({ ...structuredClone(complete), datasets: {} });

    const result = applyManifestOverrides(manifest, 'dev', noDatasetOverride);

    expect(result.warnings).toEqual([
      `dev: no dataset override for "test"; keeping ${OLD_DATASET} from manifest.json. Setting one in ManifestOverrides.ts is preferred.`,
    ]);
    expect(result.manifest.datasetsMapping?.[0]?.dataSetId).toBe(OLD_DATASET);
  });

  it('warns once per mapping when an environment has no overrides at all', () => {
    expect(() => applyManifestOverrides(manifest, 'dev', noOverrides)).not.toThrow();

    const { warnings } = applyManifestOverrides(manifest, 'dev', noOverrides);

    expect(warnings).toHaveLength(3);
    expect(warnings.every(warning => warning.includes('is preferred'))).toBe(true);
  });

  it('says so when the manifest has no id for the alias either', () => {
    const { warnings } = applyManifestOverrides(manifest, 'dev', noOverrides);

    expect(warnings).toContain(
      'dev: no workflow override for "testWorkflow"; manifest.json has no modelId for it either. Setting one in ManifestOverrides.ts is preferred.',
    );
  });

  it('warns about an override that matches no alias in the manifest', () => {
    const typo = deepFreeze<EnvironmentConfig>({ ...structuredClone(complete), datasets: { test: NEW_DATASET, tset: NEW_DATASET } });

    const { warnings } = applyManifestOverrides(manifest, 'dev', typo);

    expect(warnings).toEqual(['dev: dataset override "tset" matches no alias in manifest.json; ignoring it.']);
  });

  it('does not add a mapping section the manifest does not have', () => {
    const withoutWorkflows = deepFreeze<Manifest>({ id: 'x', datasetsMapping: [] });

    const result = applyManifestOverrides(withoutWorkflows, 'dev', complete);

    expect(result.manifest).not.toHaveProperty('workflowMapping');
    expect(result.warnings).toContain('dev: workflow override "testWorkflow" matches no alias in manifest.json; ignoring it.');
  });

  it('throws when an override is set but is not a UUID', () => {
    const malformed = deepFreeze<EnvironmentConfig>({ ...structuredClone(complete), datasets: { test: 'nope' } });

    expect(() => applyManifestOverrides(manifest, 'dev', malformed)).toThrow(
      'dev: dataset override for "test" is not a UUID: "nope"',
    );
  });

  it('throws when the design id is not a UUID', () => {
    const malformed = deepFreeze<EnvironmentConfig>({ ...structuredClone(complete), designId: 'nope' });

    expect(() => applyManifestOverrides(manifest, 'dev', malformed)).toThrow('dev: designId is not a UUID: "nope"');
  });

  it('sets proxyId only when the environment has one', () => {
    const withProxy = deepFreeze<EnvironmentConfig>({ ...structuredClone(complete), proxyId: PROXY });

    expect(applyManifestOverrides(manifest, 'dev', withProxy).manifest.proxyId).toBe(PROXY);
    expect(applyManifestOverrides(manifest, 'dev', complete).manifest).not.toHaveProperty('proxyId');
  });
});

describe('ENVIRONMENTS', () => {
  it('points dev at the beta channel and demo at the rc channel', () => {
    expect(ENVIRONMENTS.dev.sdkChannel).toBe('beta');
    expect(ENVIRONMENTS.dev.instance).toBe('dev.dev.domo.com');
    expect(ENVIRONMENTS.demo.sdkChannel).toBe('rc');
    expect(ENVIRONMENTS.demo.instance).toBe('domo.demo.domo.com');
  });

  it('uses the design ids already recorded in manifest.json', () => {
    expect(ENVIRONMENTS.dev.designId).toBe(realManifest.devId);
    expect(ENVIRONMENTS.demo.designId).toBe(realManifest.demoId);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ENVIRONMENTS)).toBe(true);
    expect(Object.isFrozen(ENVIRONMENTS.dev)).toBe(true);
    expect(Object.isFrozen(ENVIRONMENTS.demo.datasets)).toBe(true);
  });

  it.each(['dev', 'demo'] as const)('stamps the real manifest for %s without throwing', env => {
    const { manifest: stamped } = applyManifestOverrides(realManifest, env);

    expect(stamped.id).toBe(ENVIRONMENTS[env].designId);
  });

  it('has no dataset warning for demo, whose dataset id is set', () => {
    const { warnings } = applyManifestOverrides(realManifest, 'demo');

    expect(warnings.filter(warning => warning.includes('dataset'))).toEqual([]);
  });
});

describe('runtimeConfig', () => {
  it('reports the environment and the dataset ids that were stamped', () => {
    const { manifest: stamped } = applyManifestOverrides(manifest, 'dev', complete);

    expect(runtimeConfig('dev', stamped, complete)).toEqual({
      name: 'dev',
      sdkChannel: 'beta',
      instance: 'dev.example.com',
      datasetIds: { test: NEW_DATASET },
    });
  });

  it('reports the kept dataset id when there was no override', () => {
    const { manifest: stamped } = applyManifestOverrides(manifest, 'dev', noOverrides);

    expect(runtimeConfig('dev', stamped, noOverrides).datasetIds).toEqual({ test: OLD_DATASET });
  });
});
