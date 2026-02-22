# CLAUDE.md — domo.js / ryuu.js

**Package:** `ryuu.js` (npm) | **Dev name:** `domo.js` | **Version:** 5.1.4
**Purpose:** JavaScript SDK for custom apps (iframed web apps) running inside the Domo platform.

---

## Architecture

```
Custom App (iframe / WebView)
    │
    ├── Domo class (static) — public API
    │     ├── HTTP methods (get/post/put/delete/domoHttp)
    │     ├── Event listeners (onFiltersUpdated, onDataUpdated, …)
    │     └── Emitters (requestFiltersUpdate, requestVariablesUpdate, …)
    │
    ├── Services layer — business logic (filters, variables, http, …)
    ├── Utils layer — validation, DOM, headers
    └── Models — interfaces, enums, constants
```

**Communication channels:**
- **Web:** `MessageChannel` — `port2` transferred to parent on `subscribe`; app receives on `port1`
- **Mobile iOS:** `webkit.messageHandlers.domofilter` / `domovariable`
- **Mobile Android/Flutter:** global `domofilter` / `domovariable` objects injected into WebView
- **Legacy (<v4.7.0):** `window.addEventListener('message')` with `isVerifiedOrigin()` check

---

## Directory Structure

```
src/
├── index.ts                         # Re-exports all public symbols
├── domo.ts                          # Domo class + MutationObserver setup
├── domo.test.ts
│
├── models/
│   ├── constants/general.ts         # DomoEvent const, eventToListenerMap, getToken
│   ├── enums/
│   │   ├── data-formats.ts          # DataFormats (full MIME strings)
│   │   ├── domo-data-types.ts
│   │   └── request-methods.ts
│   ├── interfaces/
│   │   ├── ask-reply.ts
│   │   ├── filter.ts
│   │   ├── request.ts
│   │   └── variable.ts
│   └── services/
│       ├── appdata.ts
│       ├── dataset.ts
│       ├── filters.ts
│       ├── http.ts
│       ├── navigation.ts
│       └── variables.ts
│
└── utils/
    ├── ask-reply.ts
    ├── data-helpers.ts
    ├── domoutils.ts                  # setContentHeaders, setAuthTokenHeader, handleNode, processBody
    ├── filter.ts
    ├── general.ts                    # isVerifiedOrigin, setFormatHeaders, generateUniqueId, isIOS, isMobile
    └── variable.ts

demo/                                 # NEVER modified by agents — has its own README.md
```

---

## Public API Quick Reference

```
HTTP
  Domo.get(url, options?)                          → Promise<ResponseBody>
  Domo.getAll(urls[], options?)                    → Promise<ResponseBody[]>
  Domo.post(url, body?, options?)                  → Promise<ResponseBody>
  Domo.put(url, body?, options?)                   → Promise<ResponseBody>
  Domo.delete(url, options?)                       → Promise<ResponseBody>
  Domo.domoHttp(method, url, options?, body?)      → Promise<ResponseBody>

Listeners  (all return unsubscribe function)
  Domo.onDataUpdated(cb: (alias: string) => void)
  Domo.onFiltersUpdated(cb: (filters?: Filter[]) => void)
  Domo.onVariablesUpdated(cb: (variables: Variable[]) => void)
  Domo.onAppDataUpdated(cb: (appData: string) => void)

Emitters   (all return requestId string)
  Domo.requestFiltersUpdate(filters, pageStateUpdate?, onAck?, onReply?)
  Domo.requestVariablesUpdate(variables, onAck?, onReply?)
  Domo.requestAppDataUpdate(appData, onAck?, onReply?)

Navigation
  Domo.navigate(url: string, isNewWindow: boolean)   // no default — both args required

Utilities
  Domo.env                           // parsed URL query params (QueryParams)
  Domo.extend(overrides)             // override existing static keys only
  Domo.getRequests()                 // all tracked ASK/ACK/REPLY requests
  Domo.getRequest(requestId)         // single tracked request

Deprecated aliases (still functional — do not remove)
  onFiltersUpdate   → onFiltersUpdated
  onDataUpdate      → onDataUpdated
  onAppData         → onAppDataUpdated
  filterContainer   → requestFiltersUpdate
  sendVariables     → requestVariablesUpdate
  sendAppData       → requestAppDataUpdate
```

---

## Critical Rules for Agents

1. **Zero runtime dependencies.** `package.json` `"dependencies"` must stay `{}`.
2. **Never touch `demo/`** — it is not part of the SDK build.
3. **Service functions use `this` context.** They are designed to run with `Domo` as `this`; do not make them free functions.
4. **Never remove deprecated aliases** — external apps rely on them.
5. **Export every new public symbol from `src/index.ts`.**
6. **Colocate test files:** `foo.ts` → `foo.test.ts` in the same directory.
7. **`Domo.extend()` only overrides existing own keys** (`hasOwnProperty` check) — it cannot add new keys.
8. **`onFiltersUpdated` calls `this.connect()` (no args)** and triggers an initial `requestFiltersUpdate(null, false)` on first registration. All other listeners call `this.connect(true)` to skip the filter prefetch.

---

## Development Workflow

```bash
npm test                    # Jest (jsdom environment, ts-jest)
npm test -- --watch         # Watch mode
npm test -- --coverage      # Coverage report
npm run type-check          # tsc --noEmit
npm run build               # Webpack → dist/ + copies dist/domo.js to demo/domo.js
npm publish                 # Publishes as ryuu.js on npm
```

Test files use `jsdom` and `ts-jest`. See `jest.config.js` and `tsconfig.json` for configuration.
For implementation details (wire formats, utility signatures, service patterns), see `src/CLAUDE.md`.
