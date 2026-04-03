# ryuu.js / domo.js

JavaScript SDK (published as `ryuu.js` on npm) for building custom apps inside the Domo platform. Apps run in iframes; this library handles authenticated HTTP requests, bidirectional messaging with the parent window, mobile WebView bridges, and provides high-level helpers for Data API, AppDB, Code Engine, Workflows, and AI services.

- **Version:** 5.2.0
- **Zero runtime dependencies**
- **Build:** Webpack 5 → UMD bundle at `dist/domo.js` (~26KB), exposed as global `Domo`
- **Tests:** Jest + jsdom (`npm test`) — 179 tests across 17 suites
- **Type check:** `tsc --noEmit`

## Commands

```
npm test            # jest --silent
npm run coverage    # jest --coverage --silent
npm run build       # webpack production build → dist/domo.js
npm run build:demo  # node demo/build.js
```

## Annotated File Tree

```
src/
├── index.ts                        # Re-exports everything (barrel file)
├── domo.ts                         # Domo class: static API surface, MessageChannel setup, MutationObserver
├── domo.test.ts                    # Tests for the Domo class
├── transport.ts                    # Shared mutable HTTP transport — namespace services read from here,
│                                   #   Domo.extend() updates it so overrides propagate everywhere
│
├── types/
│   └── global.d.ts                 # Ambient types for mobile globals (domovariable, domofilter, webkit)
│
├── models/
│   ├── constants/
│   │   └── general.ts              # DomoEvent const object, eventToListenerMap, getToken()
│   │
│   ├── enums/
│   │   ├── askReply.ts             # EventType const: ASK, ACK, REPLY
│   │   ├── data-formats.ts         # DataFormats enum (MIME-based Accept headers)
│   │   ├── domo-data-types.ts      # DomoDataTypes enum (STRING, LONG, DECIMAL, etc.)
│   │   └── request-methods.ts      # RequestMethods enum (GET, POST, PUT, DELETE)
│   │
│   ├── interfaces/
│   │   ├── ask-reply.ts            # AskReplyMap, AskRequestStatus, AskResponseStatus
│   │   ├── filter.ts               # Filter union type, operator/dataType enums
│   │   ├── json.ts                 # Loose JSON type (Json, JsonMap, JsonArray)
│   │   ├── request.ts              # RequestOptions, QueryParams, ResponseBody types
│   │   └── variable.ts             # Variable interface { functionId, value }
│   │
│   └── services/                   # Business logic
│       ├── ai.ts                   # domo.ai.generateText, domo.ai.textToSQL
│       ├── appdata.ts              # requestAppDataUpdate, onAppDataUpdated, handleAppData
│       ├── appdb.ts                # domo.appdb.{list,get,create,update,remove,query,partialUpdate,bulk*,export,*Collection}
│       ├── codeengine.ts           # domo.codeEngine(alias, input)
│       ├── data.ts                 # domo.data.query(alias, opts), domo.data.sql(alias, sql)
│       ├── dataset.ts              # onDataUpdated, handleDataUpdated
│       ├── env.ts                  # buildEnv() — typed env from query params + GET /domo/environment/v1
│       ├── filters.ts              # requestFiltersUpdate, onFiltersUpdated, handleFiltersUpdated
│       ├── http.ts                 # domoHttp, get, getAll, post, put, delete (+ overloads)
│       ├── navigation.ts           # navigate(url, isNewWindow) via window.parent.postMessage
│       ├── variables.ts            # requestVariablesUpdate, onVariablesUpdated, handleVariablesUpdated
│       └── workflow.ts             # domo.workflow.start, domo.workflow.getInstance
│
└── utils/
    ├── ask-reply.ts                # handleAck, handleReply — request lifecycle tracking
    ├── data-helpers.ts             # domoFormatToRequestFormat (user format → DataFormats enum)
    ├── domoutils.ts                # setContentHeaders, setAuthTokenHeader, handleNode, processBody
    ├── filter.ts                   # isFilter, isFilterArray, guardAgainstInvalidFilters
    ├── general.ts                  # isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders, generateUniqueId, isIOS, isMobile
    └── variable.ts                 # isVariable, isVariableArray, guardAgainstInvalidVariables
```

## Key Architecture Decisions

- **Static class, no instantiation.** All public API is `Domo.get()`, `Domo.onFiltersUpdated()`, etc.
- **Service methods use `this`** referencing the Domo class. They're assigned directly as static properties (not `.bind()`); only handlers inside `connect()` use `.bind(this)`.
- **Namespace services** (`data`, `appdb`, `ai`, `workflow`) are plain objects with functions that call through `transport.ts` — a mutable registry of `get`/`post`/`put`/`delete`. `Domo.extend()` updates both the Domo class properties and the transport, so overrides propagate to all services.
- **MessageChannel** for iframe ↔ parent communication, with a legacy `window.postMessage` listener for v4.7.0 compat.
- **MutationObserver** — single observer on `document.documentElement` with `subtree: true`, catches all DOM additions at any depth. Injects auth token (`ryuu_sid`) into relative `href`/`src` attributes. Token fetched once per batch, early bail if no token.
- **Mobile bridge:** tries global `domofilter`/`domovariable` objects first, falls back to `webkit.messageHandlers` (iOS) or `window.parent.postMessage`.
- **`domo.env`** — synchronously populated from query params, then enriched in the background from `GET /domo/environment/v1`.

## Gotchas

- `DomoEvent` is a `const` object (not a TS enum).
- `DataFormats` enum values are MIME strings (e.g., `CSV = 'text/csv'`, `JSON = 'application/json'`).
- Auth header is `X-DOMO-Ryuu-Session`.
- Filter wire event name is `"filter"` (not `"filtersUpdated"`), and the wire format uses `columnName` + `operator` (desktop) or `column` + `operand` (mobile).
- `requestFiltersUpdate(null)` **clears all filters** on the parent page.
- `onFiltersUpdated` calls `connect()` without skipFilters, then sends `requestFiltersUpdate(null, false)` on first registration — this clears parent filters. All other listeners call `connect(true)`.
- `handleNode(node, token)` takes two args and recurses into children.
- `setAuthTokenHeader(headers, token)` takes two args.
- `appdb.create` and `appdb.update` auto-wrap documents in `{ content: ... }` if not already wrapped.
- `data.sql` uses POST (not GET) with `Content-Type: text/plain`.
