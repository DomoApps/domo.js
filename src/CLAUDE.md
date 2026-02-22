# src/CLAUDE.md — Implementation Reference

This file covers wire formats, accurate utility signatures, and patterns for extending the SDK.
See `/CLAUDE.md` for project overview, public API, and critical agent rules.

---

## Core Constants — Actual Values

```typescript
// src/models/constants/general.ts
export const DomoEvent = {
  appData: "appData",
  dataUpdated: "dataUpdated",
  filtersUpdated: "filtersUpdated",
  variablesUpdated: "variablesUpdated",
  ack: "ack",
} as const;

// src/domo.ts — listener keys are string literals (NOT DomoEvent values)
static listeners = {
  onDataUpdated: [],
  onFiltersUpdated: [],
  onAppDataUpdated: [],
  onVariablesUpdated: [],
};
```

---

## DataFormats Enum — Full MIME Values

```typescript
// src/models/enums/data-formats.ts
export enum DataFormats {
  ARRAY_OF_OBJECTS = 'application/array-of-objects',
  JSON             = 'application/json',       // user-facing alias: 'array-of-arrays'
  CSV              = 'text/csv',
  EXCEL            = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PLAIN            = 'text/plain'
}
```

The user-facing `DomoDataFormats` type uses short strings (`'array-of-objects' | 'array-of-arrays' | 'csv' | 'excel' | 'plain'`). `domoFormatToRequestFormat()` in `src/utils/data-helpers.ts` maps them to `DataFormats` enum values.

---

## Message Wire Contract

### Outbound (app → parent)

**Subscribe** — sent once on first `connect()`, with `port2` as transferable:
```json
{ "requestId": "<uuid>", "event": "subscribe", "skipFilters": false }
```

**Filter request (web/desktop):**
```json
{
  "requestId": "<uuid>",
  "event": "filter",
  "pageStateUpdate": true,
  "filter": [{ "columnName": "Region", "operator": "IN", "values": ["West"], "dataType": "STRING" }]
}
```

**Filter request (mobile — different format!):**
```json
[{ "column": "Region", "operand": "IN", "values": ["West"], "dataType": "STRING" }]
```
Mobile path: tries `domofilter.postMessage(JSON.stringify(array))` → iOS `webkit.messageHandlers.domofilter` → `window.parent.postMessage`.

**Variable request:**
```json
{ "requestId": "<uuid>", "event": "variable", "variables": [{ "functionId": 123, "value": "foo" }] }
```
Mobile path: tries `domovariable.postMessage(JSON.stringify(array))` → iOS `webkit.messageHandlers.domovariable` → `window.parent.postMessage`.

**AppData request:**
```json
{ "requestId": "<uuid>", "event": "appData", "appData": "<string>" }
```
Always sent via `window.parent.postMessage` (no mobile-specific path).

**Navigate:**
```json
{ "event": "navigate", "url": "<string>", "isNewWindow": false }
```
Sent via `window.parent.postMessage` (not through MessageChannel port).

### Inbound (parent → app via MessageChannel `port1`)

| `message.event`       | Relevant field         | Handler called            |
|-----------------------|------------------------|---------------------------|
| `"filtersUpdated"`    | `message.filters`      | `handleFiltersUpdated()`  |
| `"variablesUpdated"`  | `message.variables`    | `handleVariablesUpdated()`|
| `"dataUpdated"`       | `message.alias`        | `handleDataUpdated()`     |
| `"appData"`           | `message.appData`      | `handleAppData()`         |
| `"ack"`               | `message.requestId`    | `handleAck()`             |

### Legacy `window.postMessage` (v4.7.0 compat)

- Detected by `message.hasOwnProperty('alias') && !message.hasOwnProperty('event')`
- Origin verified via `isVerifiedOrigin(event.origin)` before processing
- Sends legacy ACK back: `{ event: "ack", alias: message.alias }`

---

## Utility Signatures — Accurate Reference

### `src/utils/domoutils.ts`

```typescript
// Sets Content-Type header. Skips entirely for contentType === 'multipart'.
// Default: 'application/json'
setContentHeaders(headers: Record<string,string>, options?: { contentType?: string }): void

// Sets or removes 'X-DOMO-Ryuu-Session' header. Deletes header if token is falsy.
setAuthTokenHeader(headers: Record<string,string>, token: string): void

// Sets XMLHttpRequest.responseType if options.responseType is defined.
setResponseType(req: XMLHttpRequest, options?: { responseType?: XMLHttpRequestResponseType }): void

// If node === document.body or document.head → calls processBody(node, token).
// Otherwise: appends ?ryuu_sid=token to relative href or src URLs on the node.
handleNode(node: HTMLElement, token: string): void

// Iterates node.children and calls handleNode on each child.
processBody(node: Element, token: string): void
```

### `src/utils/general.ts`

```typescript
// Origin check for legacy postMessage handler.
// Allows: localhost / 127.0.0.1 / *.localhost / file:// protocol
// Production: requires https: + HOST_WHITELIST match + not HOST_BLACKLIST
//   HOST_WHITELIST = /^(?:[\w-]+\.)*(domo|domotech|domorig)\.(com|io)$/i
//   HOST_BLACKLIST = /domoapps/i
isVerifiedOrigin(origin: string): boolean

// Sets headers["Accept"] to DataFormats MIME value.
// Only applies when url contains "data/v". Default: DataFormats.ARRAY_OF_OBJECTS.
setFormatHeaders(headers: Record<string,string>, url: string, options?: RequestOptions): void

// Uses crypto.randomUUID() when available; falls back to hex string.
generateUniqueId(): string

isIOS(): boolean    // multi-factor: UA / iPad desktop mode / webkit APIs + standalone + screen
isMobile(): boolean // isIOS() first, then UA, then multiple mobile indicators
```

---

## MutationObserver — Correct Implementation

```typescript
// src/domo.ts — module level (outside class)
const __mutationObserverCallback = (mutations: any) => {
  const token = getToken();  // reads window.__RYUU_SID__
  for (const record of mutations) {
    record.addedNodes.forEach((node: any) => {
      if (node instanceof HTMLElement) handleNode(node, token);
    });
  }
};

const ob = new MutationObserver(__mutationObserverCallback);
ob.observe(document.documentElement, { childList: true }); // NOT document.body
ob.observe(document.head, { childList: true });
```

`__mutationObserverCallback` is exported from `domo.ts` for test access.

---

## Service Patterns

### Pattern A — Emitter with request tracking

```typescript
export function requestXxxUpdate(data, onAck?: Function, onReply?: Function): string {
  guardAgainstInvalidXxx(data);
  const requestId = generateUniqueId();
  const message = { requestId, event: "xxx", xxxKey: data };

  this.requests[requestId] = {
    request: { payload: message, onAck, onReply, status: "pending", sentAt: Date.now() }
  };

  if (!isMobile()) {
    window.parent.postMessage(JSON.stringify(message), "*");
    return requestId;
  }
  // Mobile: try global object → webkit handlers → window.parent fallback
  try { xxxGlobal.postMessage(JSON.stringify(data)); }
  catch { /* ios webkit / window.parent fallbacks */ }
  return requestId;
}
```

### Pattern B — Listener registration

```typescript
export function onXxxUpdated(callback: Function) {
  // onFiltersUpdated: this.connect()   (skipFilters = false, triggers initial filter request)
  // all others:       this.connect(true) (skipFilters = true)
  this.connect(/* true */);
  this.listeners.onXxxUpdated.push(callback);

  return () => {  // unsubscribe
    const index = this.listeners.onXxxUpdated.indexOf(callback);
    if (index >= 0) this.listeners.onXxxUpdated.splice(index, 1);
  };
}
```

`onFiltersUpdated` additionally calls `this.requestFiltersUpdate(null, false)` when registering the first listener (to fetch current filter state).

### Pattern C — Handle incoming message

```typescript
export function handleXxxUpdated(message: any, responsePort?: MessagePort): void {
  if (!message) return;
  if (this.listeners.onXxxUpdated.length) {
    responsePort?.postMessage({ requestId: message.requestId, event: "ack", xxx: message.xxx });
    this.listeners.onXxxUpdated.forEach((cb: Function) => cb(message.xxx));
  }
  this.handleReply(message.requestId, message.xxx, message.error);
}
```

### Binding

Event handlers inside `connect()` use `.bind(this)` explicitly:
```typescript
[DomoEvent.filtersUpdated]: handleFiltersUpdated.bind(this),
```

Top-level static assignments do **not** use `.bind()`:
```typescript
static onFiltersUpdated = onFiltersUpdated;  // Domo is the static `this` when called
```

---

## Adding a New Service — Checklist

1. Add event key to `DomoEvent` const in `src/models/constants/general.ts`
2. Add listener key to `Domo.listeners` in `src/domo.ts`
3. Create `src/models/services/newservice.ts` with Pattern A/B/C functions
4. Import handler and add to `eventHandlers` map inside `connect()` in `domo.ts`
5. Assign static methods on `Domo` class: `static onNewEvent = onNewEvent;`
6. Export from `src/index.ts`
7. Create `src/models/services/newservice.test.ts`

---

## Testing Quick Reference

```typescript
// Mock MessageChannel at top of test file (before imports if module-level)
(global as any).MessageChannel = class {
  port1 = { onmessage: null as any, postMessage: jest.fn(), close: jest.fn() };
  port2 = { onmessage: null as any, postMessage: jest.fn(), close: jest.fn() };
};

// Mock window.parent
Object.defineProperty(window, 'parent', {
  value: { postMessage: jest.fn() }, writable: true
});

// Set auth token
(window as any)['__RYUU_SID__'] = 'test-token';

// Reset state between tests
beforeEach(() => {
  Domo.listeners.onFiltersUpdated = [];
  Domo.listeners.onVariablesUpdated = [];
  Domo.listeners.onAppDataUpdated = [];
  Domo.listeners.onDataUpdated = [];
  (Domo as any).connected = false;
  (Domo as any).channel = undefined;
});
```

See existing tests (e.g., `src/models/services/filters.test.ts`) for full examples.
