# demo/

Interactive developer toolkit for `domo.js` — runs inside a real Domo iframe. Three-tab layout: Request Builder for ad-hoc API exploration, Event Monitor for real-time wire visibility, and Test Suite for automated regression testing. Dark-themed with glassmorphism, version picker to test against any published ryuu.js release.

## Tabs

### Request Builder (`#request`)
- Method dropdown (GET/POST/PUT/DELETE) + URL input with autocomplete from endpoint presets
- Body textarea (auto-hides for GET/DELETE), collapsible options panel (format, content-type, schema)
- Response panel showing syntax-highlighted JSON, timing, structured error type badges on failure
- Session history sidebar — click any entry to replay the request

### Event Monitor (`#monitor`)
- Real-time feed of all MessageChannel and postMessage traffic
- Hooks into `Domo.debug` by monkey-patching `domo.debug.log` + raw `window.addEventListener('message')`
- Deduplication via requestId + 200ms TTL window
- Filter bar with checkboxes per event type, auto-scroll toggle, clear button
- Each entry shows: timestamp, direction (in/out), event type badge, requestId, expandable payload
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

## Build system

| Script | What it does |
|---|---|
| `node build.js` | Copies `assets/`, `domo.js`, `manifest.json`, `README.md`, `thumbnail.png` into `public-assets/` and rewrites `index.html` paths. |
| `node clean.js` | Reverses `build.js` — deletes `public-assets/` and restores original paths. |

No changes needed to build.js/clean.js — `ITEMS_TO_MOVE` includes `'assets'` as a directory, so all JS files are copied automatically.

## Key patterns

- **No framework.** Vanilla JS with class-based organization.
- **Script load order matters:** domo.js (synchronous) → config → renderer → store → request-builder → event-monitor → test-suite → app.
- **Tab state in URL hash** (`#request`, `#monitor`, `#tests`) — bookmarkable, survives reload.
- **Reactive store** — `SimpleStore` with `get/set/push/on/clear`. Components subscribe to state changes.
- **Event monitor hooks** into `domo.debug.log` by monkey-patching — captures all SDK-level events without modifying SDK source.
- **Version-resilient** — `resolveEventMethod()` and `resolveListenerKey()` try canonical names first, then legacy aliases.
- **Manifest values hardcoded** — dataset `test`, collection `SanityTest`, workflow `testWorkflow`, package `awesomeFunction` must match manifest.json.
