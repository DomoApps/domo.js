# ryuu.js / domo.js

JavaScript SDK (published as `ryuu.js` on npm) for building custom apps inside the Domo platform. Apps run in iframes; this library handles authenticated HTTP requests, messaging with the parent window, mobile WebView bridges, and provides high-level helpers for Data API, AppDB, Code Engine, Workflows, and AI services.

- **Version:** 6.0.0-alpha.0
- **Zero runtime dependencies**
- **Build:** Webpack 5 → UMD bundle at `dist/domo.js` (~28KB), exposed as global `Domo`
- **Tests:** Jest + jsdom (`npm test`) — 235 tests across 20 suites
- **Type check:** `tsc --noEmit --skipLibCheck`

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
├── domo.ts                         # Domo class: static API surface, MessageChannel setup
├── domo.test.ts                    # Tests for the Domo class
├── init.ts                         # MutationObserver setup, __mutationObserverCallback export
├── transport.ts                    # Shared mutable HTTP transport — namespace services read from here,
│                                   #   Domo.extend() updates it so overrides propagate everywhere
│
├── types/
│   └── global.d.ts                 # Ambient types for mobile globals (domovariable, domofilter, webkit)
│
├── models/
│   ├── errors.ts                   # Structured error types: DomoHttpError, DomoAuthError,
│   │                               #   DomoTimeoutError, DomoValidationError, DomoConnectionError
│   │
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
│   │   ├── request.ts              # RequestOptions (incl. schema), QueryParams, ResponseBody types
│   │   └── variable.ts             # Variable interface { functionId?, name?, value }
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
│       ├── http.ts                 # domoHttp, get, getAll, post, put, delete (+ schema validation, interceptors, debug)
│       ├── interceptors.ts         # Request interceptor middleware (onion model)
│       ├── navigation.ts           # navigate(url, isNewWindow) via window.parent.postMessage
│       ├── variables.ts            # requestVariablesUpdate, onVariablesUpdated, handleVariablesUpdated
│       └── workflow.ts             # domo.workflow.start, domo.workflow.getInstance
│
└── utils/
    ├── ask-reply.ts                # handleAck, handleReply — request lifecycle tracking
    ├── data-helpers.ts             # domoFormatToRequestFormat (user format → DataFormats enum)
    ├── debug.ts                    # domoDebug singleton — category-based logging, localStorage persistence
    ├── domoutils.ts                # setContentHeaders, setAuthTokenHeader, handleNode, processBody
    ├── filter.ts                   # isFilter, isFilterArray, guardAgainstInvalidFilters
    ├── general.ts                  # isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders, generateUniqueId, isIOS, isMobile
    └── variable.ts                 # isVariable, isVariableArray, guardAgainstInvalidVariables
```

## Key Architecture Decisions

- **Static class, no instantiation.** All public API is `Domo.get()`, `Domo.onFiltersUpdated()`, etc.
- **Service methods use `this`** referencing the Domo class. They're assigned directly as static properties (not `.bind()`); only handlers inside `connect()` use `.bind(this)`.
- **Namespace services** (`data`, `appdb`, `ai`, `workflow`) are plain objects with functions that call through `transport.ts` — a mutable registry of `get`/`post`/`put`/`delete`. `Domo.extend()` updates both the Domo class properties and the transport, so overrides propagate to all services.
- **MessageChannel (receive-only)** — SDK creates a `MessageChannel`, transfers `port2` to the parent via `window.parent.postMessage` during subscribe. Parent sends events (filtersUpdated, variablesUpdated, ack, etc.) through `port2`; SDK listens on `port1`. **Outbound SDK messages** (requestFiltersUpdate, requestVariablesUpdate, navigate, etc.) always use `window.parent.postMessage` — this is intentional: the parent can verify `event.origin` on postMessage, whereas MessagePort events carry no origin. Legacy `window.postMessage` listener for v4.7.0 compat.
- **MutationObserver** — single observer on `document.documentElement` with `subtree: true`, catches all DOM additions at any depth. Injects auth token (`ryuu_sid`) into relative `href`/`src` attributes. Token fetched once per batch, early bail if no token. Setup in `init.ts`.
- **Mobile bridge:** tries global `domofilter`/`domovariable` objects first, falls back to `webkit.messageHandlers` (iOS) or `window.parent.postMessage`.
- **`domo.env`** — synchronously populated from query params, then enriched in the background from `GET /domo/environment/v1`.
- **Structured error hierarchy** — `DomoHttpError` > `DomoAuthError` for HTTP; `DomoConnectionError` for network; `DomoValidationError` for input validation and schema failures.
- **Request interceptors** — onion-model middleware chain via `Domo.intercept()`. Wraps the fetch call in `domoHttp`.
- **Debug mode** — `Domo.debug.enable()` or `localStorage.__domo_debug__`. Logs HTTP requests, MessageChannel messages, filter/variable updates with category filtering.

## Debug Log Prefixes

All messaging is logged through `domoDebug.log('messages', prefix, eventType, payload)` with structured prefixes:

| Prefix | Direction | Transport | Where |
|---|---|---|---|
| `received:channel` | in | MessageChannel (port1) | `domo.ts` — port1.onmessage |
| `received:postMessage` | in | window.postMessage | `domo.ts` — legacy handler |
| `sent:postMessage` | out | window.parent.postMessage | subscribe, filter, variable, appData, navigate |
| `sent:mobile` | out | mobile bridge | domofilter, domovariable, webkit |
| `sent:ack` | out | window.postMessage | legacy ACKs in `domo.ts` |
| `sent:ack:channel` | out | MessagePort (responsePort) | ACKs in filters, variables, dataset, appdata handlers |

## New APIs (v6.0+)

| API | Description |
|---|---|
| `Domo.intercept(fn)` | Register request interceptor, returns unsubscribe |
| `Domo.debug.enable(categories?)` | Enable debug logging (`'http'`, `'messages'`, `'filters'`, `'variables'`, `'all'`) |
| `Domo.debug.disable()` | Disable debug logging |
| `RequestOptions.schema` | Optional `{ parse }` for runtime response validation |
| `requestAppDataUpdate(payload, onAck, onReply, { echoRequestId })` | Optional 4th opts bag — echoes a host correlation id (DOMO-483472) back on the wire |
| `requestFiltersUpdate(filters, pageStateUpdate, onAck, onReply, { echoRequestId })` | Optional 5th opts bag — echoes a host correlation id (DOMO-483472) back on the wire |

## Error Types

| Class | Thrown When |
|---|---|
| `DomoHttpError` | Non-2xx HTTP response (has `status`, `statusText`, `body`, `headers`) |
| `DomoAuthError` | 401 or 403 response (extends `DomoHttpError`) |
| `DomoConnectionError` | Network failure (fetch rejects) |
| `DomoValidationError` | Invalid filters/variables/schema parse failure (has `errors[]`) |
| `DomoTimeoutError` | Request or message timeout (has `url`) |

## Gotchas

- `DomoEvent` is a `const` object (not a TS enum).
- `DataFormats` enum values are MIME strings (e.g., `CSV = 'text/csv'`, `JSON = 'application/json'`).
- Auth header is `X-DOMO-Ryuu-Session`.
- Filter wire event name is `"filter"` (not `"filtersUpdated"`), and the wire format uses `columnName` + `operator` (desktop) or `column` + `operand` (mobile).
- `requestFiltersUpdate(null)` **clears all filters** on the parent page.
- `onFiltersUpdated` calls `connect()` without skipFilters; the SUBSCRIBE replay delivers initial filters. All other listeners call `connect(true)`. The SDK intentionally does NOT follow up with `requestFiltersUpdate(null, false)` — DomoWeb treats a null-filter request as a page-level clear (DOMO-483920).
- `handleNode(node, token)` takes two args and recurses into children.
- `setAuthTokenHeader(headers, token)` takes two args.
- `appdb.create` and `appdb.update` auto-wrap documents in `{ content: ... }` if not already wrapped.
- `data.sql` uses POST (not GET) with `Content-Type: text/plain`.
- Validation errors (`guardAgainstInvalidFilters`, `guardAgainstInvalidVariables`) log the expected data model as an actual object to `console.error` before throwing `DomoValidationError`.
- `Domo.listeners` is typed via `DomoListeners` interface — callback signatures are `(filters: Filter[]) => void`, `(variables: Variable[]) => void`, `(appData: string) => void`, `(alias: string) => void`.
- Interceptors wrap the fetch call (not the entire domoHttp flow), so headers/auth are already set when the interceptor runs.
- Host echo correlation (DOMO-483472): inbound `onAppDataUpdated` / `onFiltersUpdated` callbacks receive an optional 2nd `requestId?: string` arg holding the host's correlation id. Outbound `requestAppDataUpdate` / `requestFiltersUpdate` accept `{ echoRequestId }` in their opts bag; the SDK emits it as a wire field distinct from its own ACK-tracking `requestId`. Validated against `^[A-Za-z0-9_\-:.]{1,128}$` (mirrors DomoWeb's `sanitizeRequestId`).
