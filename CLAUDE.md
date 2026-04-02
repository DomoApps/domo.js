# ryuu.js / domo.js

JavaScript SDK (published as `ryuu.js` on npm) for building custom apps inside the Domo platform. Apps run in iframes; this library handles authenticated HTTP requests, bidirectional messaging with the parent window, and mobile WebView bridges.

- **Version:** 5.1.4
- **Zero runtime dependencies**
- **Build:** Webpack 5 → UMD bundle at `dist/domo.js`, exposed as global `Domo`
- **Tests:** Jest + jsdom (`npm test`)
- **Type check:** `tsc --noEmit`

## Commands

```
npm test            # jest --silent
npm run coverage    # jest --coverage --silent
npm run build       # webpack production build → dist/domo.js
```

## Annotated File Tree

```
src/
├── index.ts                        # Re-exports everything (barrel file)
├── domo.ts                         # Domo class: static API surface, MessageChannel setup, MutationObserver
├── domo.test.ts                    # Tests for the Domo class
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
│   └── services/                   # Business logic — each service uses `this` bound to Domo class
│       ├── appdata.ts              # requestAppDataUpdate, onAppDataUpdated, handleAppData
│       ├── dataset.ts              # onDataUpdated, handleDataUpdated
│       ├── filters.ts              # requestFiltersUpdate, onFiltersUpdated, handleFiltersUpdated
│       ├── http.ts                 # domoHttp, get, getAll, post, put, delete (+ overloads)
│       ├── navigation.ts           # navigate(url, isNewWindow) via window.parent.postMessage
│       └── variables.ts            # requestVariablesUpdate, onVariablesUpdated, handleVariablesUpdated
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
- **MessageChannel** for iframe ↔ parent communication, with a legacy `window.postMessage` listener for v4.7.0 compat.
- **MutationObserver** on `document.documentElement` and `document.head` auto-injects auth tokens into DOM elements.
- **Mobile bridge:** tries global `domofilter`/`domovariable` objects first, falls back to `webkit.messageHandlers` (iOS) or `window.parent.postMessage`.

## Gotchas

- `DomoEvent` is a `const` object (not a TS enum).
- `DataFormats` enum values are MIME strings (e.g., `CSV = 'text/csv'`, `JSON = 'application/json'`).
- Auth header is `X-DOMO-Ryuu-Session`.
- Filter wire event name is `"filter"` (not `"filtersUpdated"`), and the wire format uses `columnName` + `operator` (desktop) or `column` + `operand` (mobile).
- `requestFiltersUpdate(null)` **clears all filters** on the parent page. The `subscribe` event (sent by `connect()` with `skipFilters: false`) is the mechanism that returns current filters to the app.
- `onFiltersUpdated` calls `connect()` without skipFilters, then sends `requestFiltersUpdate(null, false)` on first registration — this clears parent filters. All other listeners call `connect(true)`.
- `handleNode(node, token)` takes two args.
- `setAuthTokenHeader(headers, token)` takes two args.
