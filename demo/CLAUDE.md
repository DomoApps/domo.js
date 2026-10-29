# demo/

Interactive developer toolkit for `domo.js` — runs inside a real Domo iframe. Three-tab layout: Request Builder for ad-hoc API exploration, Event Monitor for real-time wire visibility, and Test Suite for automated regression testing. Dark-themed with glassmorphism, version picker to test against any published ryuu.js release.

## Tabs

### Request Builder (`#request`)
- Method dropdown (GET/POST/PUT/DELETE) + URL input with autocomplete from endpoint presets
- Body textarea (auto-hides for GET/DELETE), collapsible options panel (format, content-type, schema)
- Response panel showing syntax-highlighted JSON, timing, structured error type badges on failure
- Session history sidebar — click any entry to replay the request

### Event Monitor (`#monitor`)
- Real-time feed of **all** MessageChannel, postMessage, and mobile bridge traffic — every inbound and outbound message is captured
- Hooks into `Domo.debug` by monkey-patching `domo.debug.log` + raw `window.addEventListener('message')` as fallback
- Monitoring starts eagerly on app init (not lazily on tab switch) so early events (ACKs, initial filter/variable pushes) are captured
- Each entry shows: timestamp, direction arrow (in/out), event type badge, **transport source badge** (MessageChannel / postMessage / mobile), requestId, expandable payload
- Filter bar with checkboxes per event type: `dataUpdated`, `filtersUpdated`, `variablesUpdated`, `appData`, `ack`, `subscribe`, `filter`, `variable`, `navigate`, `http`
- Auto-scroll toggle, clear button
- Graceful degradation for older SDK versions without `domo.debug`

### Test Suite (`#tests`)
- **HTTP CRUD** — `domo.get`, `domo.post`, `domo.put`, `domo.delete` against AppDB collection (`SanityTest`)
- **Data API** — `domo.data.query` and `domo.data.sql` against the `test` dataset alias
- **AppDB** — `domo.appdb.list`, `domo.appdb.create`, `domo.appdb.update`, `domo.appdb.remove`
- **Event listeners** — `onDataUpdated`, `onFiltersUpdated`, `onVariablesUpdated`, `onAppDataUpdated` (event-driven)
- **Event requests** — `requestFiltersUpdate`, `requestVariablesUpdate`, `requestAppDataUpdate`
- **Code Engine** — `domo.codeEngine("awesomeFunction", ...)`
- **Workflows** — `domo.workflow.start` and `domo.workflow.getInstance`
- **AI Services** — `domo.ai.generateText` and `domo.ai.textToSQL`
- **Utilities** — `domo.env`, iOS detection
- **DX Tools** — debug mode, interceptors, structured errors, schema validation
- **Host Echo Correlation (DOMO-483472)** — synthetic-dispatch tests for `onAppDataUpdated`/`onFiltersUpdated` requestId surfacing, plus wire-emission and validation checks for `echoRequestId` on `requestAppDataUpdate`/`requestFiltersUpdate`
- Run All / Run Category / Run Single, with event warning banner

## Architecture

```
demo/assets/js/
├── config.js           # Manifest aliases, endpoint presets, category meta, constants
├── store.js            # Reactive pub/sub state store (session only)
├── renderer.js         # DataRenderer, ResultFormatter, RequestRenderer, EventRenderer, DOMUtils, GeneralUtils, ExportUtils
├── request-builder.js  # Request Builder tab — form, presets, response display, history
├── event-monitor.js    # Event Monitor tab — debug hook, feed, filters, dedup, auto-scroll
├── test-suite.js       # Test definitions + TestSuite class (merged from old tests.js + app.js)
└── app.js              # Tab manager, version picker, env panel, initialization
```

Script load order: config → renderer → store → request-builder → event-monitor → test-suite → app

```
demo/
├── ManifestOverrides.ts  # Per-environment (dev/demo): design id, dataset/workflow/Code Engine ids, SDK channel
├── build-env.ts          # --env dev|demo → demo/.build/<env>/ (stamped manifest, env.js, index.html, assets)
├── upload.ts             # --env dev|demo → build-env, check the CLI's current instance, then domo publish
├── tsconfig.json         # Compiles the .ts files above to .demo-out/ (gitignored)
└── __tests__/            # Jest `demo` project
```

## Build system

| Script | What it does |
|---|---|
| `node build.js` | Copies `assets/`, `domo.js`, `manifest.json`, `README.md`, `thumbnail.png` into `public-assets/` and rewrites `index.html` paths. |
| `node clean.js` | Reverses `build.js` — deletes `public-assets/` and restores original paths. |
| `npm run build:demo:dev` / `build:demo:demo` | Compiles the TS, then writes `demo/.build/<env>/` without publishing (see Blue/green environments). |
| `npm run upload:dev` / `upload:demo` | Same build, then `domo publish` from `demo/.build/<env>/`. Refuses unless the Domo CLI's current instance is the environment's. |

No changes needed to build.js/clean.js — `ITEMS_TO_MOVE` includes `'assets'` as a directory, so all JS files are copied automatically. `public-assets/` is committed, so after editing `assets/` run `npm run build:demo` to keep it in sync.

## Blue/green environments

`dev` (`dev.dev.domo.com`) loads `ryuu.js@beta` by default and `demo` (`domo.demo.domo.com`) loads `ryuu.js@rc`.

- `ManifestOverrides.ts` is the single home for per-environment values. `applyManifestOverrides` is pure and returns `{ manifest, warnings }`; a missing override **warns and keeps manifest.json's value**, it does not throw. Only an override that is set but not a UUID throws.
- The Domo CLI (`ryuu`) reads only `manifest.id`, never `devId`/`demoId`/`prodId`, and writes `id` back when it creates a design. So each environment is published from its own generated folder, never from the tracked manifest.
- `upload.ts` wraps `build-env.ts` and `domo publish`. `domo publish` has no `--instance` flag; the CLI's current instance is the most recently written `~/.config/configstore/ryuu/<instance>.json` (read from ryuu 5.1.0 source). `upload.ts` compares file names only, never token contents, and stops with the `domo login -i <instance>` to run on a mismatch. A wrong-instance publish would otherwise 403 or offer to create a duplicate design.
- `build-env.ts` writes `public-assets/env.js` (`window.DEMO_ENV = { name, sdkChannel, instance, datasetIds }`) and loads it before the SDK loader. `index.html` picks the SDK source as `?v=` → `DEMO_ENV.sdkChannel` → `local`; `?v=` is validated, since it is written into a `document.write`.
- `beta`/`rc` with nothing published (rc before the first rc) 404s, `window.domo` stays undefined, and `index.html` loads `latest` instead and sets `RYUUJS_FALLBACK`. `app.js` shows a banner and `rc → latest (fallback)` in the env panel.
- jsDelivr caches tag URLs (up to 12h edge, 7d browser); the env panel shows the requested channel, not the resolved version.
- The workflow and Code Engine id keys (`modelId`, `packageId`) are assumed; the CLI and client do not validate them.

## Key patterns

- **No framework.** Vanilla JS with class-based organization.
- **Script load order matters:** domo.js (synchronous) → config → renderer → store → request-builder → event-monitor → test-suite → app.
- **Tab state in URL hash** (`#request`, `#monitor`, `#tests`) — bookmarkable, survives reload.
- **Reactive store** — `SimpleStore` with `get/set/push/on/clear`. Components subscribe to state changes.
- **Event monitor hooks** into `domo.debug.log` by monkey-patching — captures all SDK-level events without modifying SDK source.
- **Version-resilient** — `resolveEventMethod()` and `resolveListenerKey()` try canonical names first, then legacy aliases.
- **Manifest aliases hardcoded** — dataset `test`, collection `SanityTest`, workflow `testWorkflow`, package `awesomeFunction` must match manifest.json. The ids behind those aliases are per environment and live in `ManifestOverrides.ts`.
