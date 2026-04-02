# models/

Pure data definitions — interfaces, enums, constants, and service logic. No side effects in constants/enums/interfaces; services contain business logic bound to the Domo class.

## constants/general.ts

- `DomoEvent` — `const` object (not enum) mapping camelCase keys to camelCase string values: `appData`, `dataUpdated`, `filtersUpdated`, `variablesUpdated`, `ack`.
- `eventToListenerMap` — maps `DomoEvent` values to `Domo.listeners` keys (e.g., `"filtersUpdated" → "onFiltersUpdated"`).
- `getToken()` — reads `window.__RYUU_SID__` (the Ryuu session token).

## enums/

| File | Export | Notes |
|---|---|---|
| `askReply.ts` | `EventType` (const object) | `ASK`, `ACK`, `REPLY` — not actually used by services currently |
| `data-formats.ts` | `DataFormats` (enum) | Values are MIME strings: `ARRAY_OF_OBJECTS = 'application/array-of-objects'`, `JSON = 'application/json'`, `CSV = 'text/csv'`, `EXCEL = 'application/vnd.openxmlformats-...'`, `PLAIN = 'text/plain'` |
| `domo-data-types.ts` | `DomoDataTypes` (enum) | `STRING`, `LONG`, `DECIMAL`, `DOUBLE`, `DATE`, `DATETIME` |
| `request-methods.ts` | `RequestMethods` (enum) | `GET`, `POST`, `PUT`, `DELETE` |

## interfaces/

- **`filter.ts`** — `Filter` is a union of `BaseFilter<T, O, D>` variants keyed by data type. Separate enums for `FilterOperatorsString` (IN, NOT_IN, CONTAINS, etc.) and `FilterOperatorsNumeric` (GREATER_THAN, EQUALS, BETWEEN, etc.). Note: `GREAT_THAN_EQUALS_TO` is the actual enum value (historical typo).
- **`variable.ts`** — `Variable { functionId: number; value: any }`.
- **`request.ts`** — `RequestOptions<F>` (format, responseType, fetch override, contentType), `QueryParams`, `RequestBody = unknown`, `ArrayResponseBody`, `ObjectResponseBody`, `ResponseBody` union.
- **`ask-reply.ts`** — `AskReplyMap` tracks request lifecycle: status flows `pending → acknowledged → fulfilled/rejected`. Stores `onAck`/`onReply` callbacks, timestamps.
- **`json.ts`** — Loose recursive JSON type.

## services/

All service functions use `this` to access the Domo class (channel, listeners, requests). They are assigned as static properties on `Domo` directly (no `.bind()`).

### http.ts — HTTP Service

Core request pipeline: `domoHttp(method, url, options?, body?)`.

1. Sets format headers via `setFormatHeaders` (only for `/data/v` URLs)
2. Sets content headers via `setContentHeaders`
3. Sets auth token via `setAuthTokenHeader(headers, getToken())`
4. Calls `fetch` (or custom `options.fetch`)
5. Parses response: JSON by default, `.text()` for csv/excel, `.blob()` for `responseType: "blob"`

Convenience methods (`get`, `post`, `put`, `trash` exported as `delete`) delegate to `domoHttp`. Each resolves `this?.domoHttp ?? domoHttp` to support both class-bound and standalone usage.

`getAll` uses `Promise.all` over `get`.

All methods have TypeScript overloads for format-specific return types.

### filters.ts — Filter Service

- **`requestFiltersUpdate(filters, pageStateUpdate?, onAck?, onReply?)`** — Validates via `guardAgainstInvalidFilters`, generates requestId, stores in `this.requests`. Desktop wire format: `{ event: "filter", filter: [{ columnName, operator, values, dataType }], pageStateUpdate }`. Mobile wire format: `[{ column, operand, values, dataType }]`. Passing `null` for filters **clears all filters** on the parent page.
- **`onFiltersUpdated(callback)`** — First listener triggers `connect()` (no skipFilters) and sends initial `requestFiltersUpdate(null, false)`, which clears the parent's filters. The `subscribe` event (sent by `connect()` with `skipFilters: false`) is what returns the current filters to the app. Returns unsubscribe function.
- **`handleFiltersUpdated(message, responsePort?)`** — Sends ACK via responsePort, invokes callbacks with `message.filters`, calls `handleReply`.

### variables.ts — Variable Service

- **`requestVariablesUpdate(variables, onAck?, onReply?)`** — Accepts `string | Variable[]`. Validates, parses if string. Wire: `{ event: "variable", variables: [...] }`. Mobile: sends stringified variables via `domovariable.postMessage`.
- **`onVariablesUpdated(callback)`** — Calls `connect(true)`. Returns unsubscribe function.
- **`handleVariablesUpdated(message, responsePort?)`** — ACK + callbacks + handleReply.

### appdata.ts — AppData Service

- **`requestAppDataUpdate(appData, onAck?, onReply?)`** — Wire: `{ event: "appData", appData }`. Desktop only (no mobile bridge).
- **`onAppDataUpdated(callback)`** — Calls `connect(true)`. Returns unsubscribe function.
- **`handleAppData(message, responsePort?)`** — ACK + callbacks + handleReply.

### dataset.ts — Dataset Service

- **`onDataUpdated(callback)`** — Calls `connect(true)`. Callback receives `alias: string`.
- **`handleDataUpdated(message, responsePort?)`** — ACK + callbacks. No handleReply (no request tracking for dataset events).

### navigation.ts

- **`navigate(url, isNewWindow)`** — Simple `window.parent.postMessage` with `{ event: "navigate", url, isNewWindow }`.
