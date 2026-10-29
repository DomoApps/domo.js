// Per-environment values for the demo app's manifest and page.
//
// A Custom App has to point at the dataset, workflow and Code Engine ids that exist on the Domo instance it is
// published to. Those ids live here instead of being hand-edited in manifest.json, and build-env.ts stamps them
// into a per-environment copy of the manifest. A missing value is a warning, never an error.

export type EnvName = 'dev' | 'demo';
export type SdkChannel = 'beta' | 'rc';

export interface EnvironmentConfig {
  /** Becomes `manifest.id`: this design's id on the environment's Domo instance. */
  readonly designId: string;
  /** Domo instance hostname, used for the dataset link and the publish instructions. */
  readonly instance: string;
  /** The npm dist-tag of ryuu.js that the deployed demo loads by default. */
  readonly sdkChannel: SdkChannel;
  readonly description: string;
  /** Alias -> `dataSetId`. */
  readonly datasets?: Readonly<Record<string, string>>;
  /** Alias -> workflow `modelId`. */
  readonly workflows?: Readonly<Record<string, string>>;
  /** Alias -> Code Engine `packageId`. */
  readonly packages?: Readonly<Record<string, string>>;
  /** Only used by `domo dev`. */
  readonly proxyId?: string;
}

export type MappingEntry = Readonly<Record<string, unknown>> & { readonly alias: string };

export interface Manifest {
  readonly [key: string]: unknown;
  readonly datasetsMapping?: readonly MappingEntry[];
  readonly workflowMapping?: readonly MappingEntry[];
  readonly packageMapping?: readonly MappingEntry[];
}

export interface OverrideResult {
  readonly manifest: Manifest;
  readonly warnings: readonly string[];
}

/** What the page needs to know about the environment it was built for. */
export interface RuntimeConfig {
  readonly name: EnvName;
  readonly sdkChannel: SdkChannel;
  readonly instance: string;
  /** Alias -> the `dataSetId` that was actually stamped into the manifest. */
  readonly datasetIds: Readonly<Record<string, string>>;
}

export const ENVIRONMENTS: Readonly<Record<EnvName, EnvironmentConfig>> = Object.freeze({
  dev: Object.freeze({
    designId: '91d67b0c-d556-494f-ae19-76f64e1754c5',
    instance: 'dev.dev.domo.com',
    sdkChannel: 'beta',
    description: 'A simple Domo.js application for testing purposes. Located in dev.dev. Loads ryuu.js@beta.',
    // Add this instance's ids as `datasets`, `workflows` and `packages` (alias -> id). Until they are set, the
    // build warns and keeps whatever manifest.json has, which are the demo instance's ids.
  }),
  demo: Object.freeze({
    designId: '6746d72d-92ad-4d07-a741-53427a02bcf8',
    instance: 'domo.demo.domo.com',
    sdkChannel: 'rc',
    description: 'A simple Domo.js application for testing purposes. Located in domo.demo. Loads ryuu.js@rc.',
    datasets: Object.freeze({ test: 'f8956b7f-13cf-45f1-96dd-a27ed3910c18' }),
  }),
});

interface MappingSpec {
  readonly section: 'datasetsMapping' | 'workflowMapping' | 'packageMapping';
  readonly idKey: 'dataSetId' | 'modelId' | 'packageId';
  readonly overrides: 'datasets' | 'workflows' | 'packages';
  readonly label: string;
}

const MAPPINGS: readonly MappingSpec[] = Object.freeze([
  { section: 'datasetsMapping', idKey: 'dataSetId', overrides: 'datasets', label: 'dataset' },
  { section: 'workflowMapping', idKey: 'modelId', overrides: 'workflows', label: 'workflow' },
  { section: 'packageMapping', idKey: 'packageId', overrides: 'packages', label: 'Code Engine package' },
]);

interface Resolved<T> {
  readonly value: T;
  readonly warnings: readonly string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(what: string, value: string): void {
  if (!UUID.test(value)) throw new Error(`${what} is not a UUID: "${value}"`);
}

function missingWarning(env: EnvName, alias: string, spec: MappingSpec, kept: unknown): string {
  const keeping =
    typeof kept === 'string' ? `keeping ${kept} from manifest.json` : `manifest.json has no ${spec.idKey} for it either`;
  return `${env}: no ${spec.label} override for "${alias}"; ${keeping}. Setting one in ManifestOverrides.ts is preferred.`;
}

function resolveEntry(
  env: EnvName,
  entry: MappingEntry,
  spec: MappingSpec,
  override: string | undefined,
): Resolved<MappingEntry> {
  if (!override) return { value: entry, warnings: [missingWarning(env, entry.alias, spec, entry[spec.idKey])] };
  assertUuid(`${env}: ${spec.label} override for "${entry.alias}"`, override);
  return { value: { ...entry, [spec.idKey]: override }, warnings: [] };
}

function applyMapping(
  env: EnvName,
  entries: readonly MappingEntry[],
  spec: MappingSpec,
  overrides: Readonly<Record<string, string>>,
): Resolved<readonly MappingEntry[]> {
  const byAlias = new Map(Object.entries(overrides));
  const aliases = new Set(entries.map(entry => entry.alias));
  const resolved = entries.map(entry => resolveEntry(env, entry, spec, byAlias.get(entry.alias)));
  const unmatched = [...byAlias.keys()]
    .filter(alias => !aliases.has(alias))
    .map(alias => `${env}: ${spec.label} override "${alias}" matches no alias in manifest.json; ignoring it.`);
  return {
    value: resolved.map(item => item.value),
    warnings: [...resolved.flatMap(item => item.warnings), ...unmatched],
  };
}

/**
 * Returns a copy of `manifest` pointed at one environment's ids. A mapping with no override keeps the manifest's
 * existing value and adds a warning; only an override that is set but is not a UUID throws.
 *
 * @param manifest - The tracked demo/manifest.json. It is not modified.
 * @param env - Which environment to stamp.
 * @param config - Defaults to the environment's entry in ENVIRONMENTS.
 */
export function applyManifestOverrides(
  manifest: Manifest,
  env: EnvName,
  config: EnvironmentConfig = ENVIRONMENTS[env],
): OverrideResult {
  assertUuid(`${env}: designId`, config.designId);
  if (config.proxyId) assertUuid(`${env}: proxyId`, config.proxyId);

  const applied = MAPPINGS.map(spec => ({
    spec,
    result: applyMapping(env, manifest[spec.section] ?? [], spec, config[spec.overrides] ?? {}),
  }));
  const sections = Object.fromEntries(
    applied.filter(({ spec }) => manifest[spec.section] !== undefined).map(({ spec, result }) => [spec.section, result.value]),
  );

  return {
    manifest: {
      ...manifest,
      ...sections,
      ...(config.proxyId ? { proxyId: config.proxyId } : {}),
      id: config.designId,
      description: config.description,
    },
    warnings: applied.flatMap(({ result }) => result.warnings),
  };
}

/**
 * The values the page reads from `window.DEMO_ENV`.
 *
 * @param manifest - The stamped manifest, so the dataset ids are the ones that were actually published.
 */
export function runtimeConfig(
  env: EnvName,
  manifest: Manifest,
  config: EnvironmentConfig = ENVIRONMENTS[env],
): RuntimeConfig {
  const datasetIds = Object.fromEntries(
    (manifest.datasetsMapping ?? [])
      .filter(entry => typeof entry.dataSetId === 'string')
      .map(entry => [entry.alias, entry.dataSetId as string] as const),
  );
  return { name: env, sdkChannel: config.sdkChannel, instance: config.instance, datasetIds };
}
