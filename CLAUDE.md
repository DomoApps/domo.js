# CLAUDE.md

ryuu.js (npm) / domo.js (dev) is a zero-dependency TypeScript SDK for custom apps embedded in the Domo platform. It runs inside an iframe or mobile WebView and provides:

- **HTTP API access** — authenticated GET/POST/PUT/DELETE requests to Domo APIs
- **Bidirectional messaging** — MessageChannel (web) or native bridge (iOS/Android) to the parent Domo shell
- **Event subscriptions** — real-time callbacks for dataset updates, filter changes, and variable changes
- **Request tracking** — ASK/ACK/REPLY pattern with per-request status and callbacks
- **Mobile support** — `webkit.messageHandlers` (iOS) and injected globals `domofilter`/`domovariable` (Android)

For detailed wire formats, service signatures, and implementation patterns see `src/CLAUDE.md`.

---

## src/ layout

```
src/
├── index.ts                          # Public exports (re-exports everything below)
├── domo.ts                           # Domo static class — init, connect(), all public methods
├── domo.test.ts
│
├── types/
│   └── global.d.ts                   # Ambient types for webkit/domovariable/domofilter globals
│
├── models/
│   ├── constants/
│   │   └── general.ts                # DomoEvent const object, eventToListenerMap, getToken
│   │
│   ├── enums/
│   │   ├── askReply.ts               # EventType enum: ASK | ACK | REPLY
│   │   ├── data-formats.ts           # DataFormats enum (MIME strings)
│   │   ├── domo-data-types.ts        # DomoDataTypes enum (STRING, LONG, DATE, …)
│   │   └── request-methods.ts        # RequestMethods enum (GET, POST, PUT, DELETE)
│   │
│   ├── interfaces/
│   │   ├── ask-reply.ts              # AskReplyMap — request tracking shape
│   │   ├── filter.ts                 # Filter, FilterOperators*, FilterDataTypes
│   │   ├── json.ts                   # Json type alias
│   │   ├── request.ts                # RequestOptions, ResponseBody (conditional on format)
│   │   └── variable.ts               # Variable { functionId, value }
│   │
│   └── services/                     # Business logic — each file owns one feature area
│       ├── http.ts / http.test.ts    # domoHttp, get, getAll, post, put, delete
│       ├── filters.ts / *.test.ts    # requestFiltersUpdate, onFiltersUpdated, handleFiltersUpdated
│       ├── variables.ts / *.test.ts  # requestVariablesUpdate, onVariablesUpdated, handleVariablesUpdated
│       ├── dataset.ts / *.test.ts    # onDataUpdated, handleDataUpdated
│       ├── appdata.ts / *.test.ts    # requestAppDataUpdate, onAppDataUpdated, handleAppData
│       └── navigation.ts / *.test.ts # navigate(route, isNewWindow)
│
└── utils/                            # Pure helpers — no side effects, no Domo class references
    ├── ask-reply.ts / *.test.ts      # handleAck, handleReply, request-map helpers
    ├── data-helpers.ts               # Format → Accept header mapping
    ├── domoutils.ts / *.test.ts      # setAuthTokenHeader, processBody, handleNode (MutationObserver cb)
    ├── filter.ts / *.test.ts         # isFilter, isFilterArray, guardAgainstInvalidFilters
    ├── general.ts / *.test.ts        # isSuccess, isVerifiedOrigin, getQueryParams, isIOS, isMobile, generateUniqueId
    └── variable.ts                   # isVariable, guardAgainstInvalidVariables
```
