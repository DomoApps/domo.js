# utils/

Pure helper functions — validation, type guards, header manipulation, DOM handling, and platform detection. No `this` binding; these are standalone functions.

## ask-reply.ts — Request Lifecycle

Manages the ASK → ACK → REPLY state machine stored in `Domo.requests`.

- **`handleAck(data, responsePort)`** — Looks up `this.requests[requestId]`, sets status to `"acknowledged"`, records `ackAt` timestamp, invokes `onAck` callback.
- **`handleReply(requestId, payload, error?)`** — Sets status to `"fulfilled"` or `"rejected"`, records `repliedAt`, stores response, invokes `onReply(payload, error)`.

Both use `this` (bound to Domo class when called via `Domo.handleAck`/`Domo.handleReply`).

## general.ts — Core Utilities

- **`isSuccess(status)`** — `status >= 200 && status < 300`.
- **`isVerifiedOrigin(origin)`** — Parses with `new URL()`. Allows localhost/127.0.0.1/file:// for dev. Production requires `https:` + hostname matching `HOST_WHITELIST` regex (`domo.com`, `domotech.com`, `domorig.com`, etc.) and not matching `HOST_BLACKLIST` (`domoapps`).
- **`getQueryParams()`** — Parses `window.location.search` into `QueryParams` object.
- **`setFormatHeaders(headers, url, options?)`** — Sets `Accept` header only if URL contains `"data/v"`. Maps user-facing format to `DataFormats` enum MIME string via `domoFormatToRequestFormat`.
- **`generateUniqueId()`** — Uses `crypto.randomUUID()` if available, falls back to random hex string.
- **`isIOS()`** — Multi-factor: UA check for iPhone/iPad/iPod, iPad desktop mode detection (macOS UA + touch + maxTouchPoints > 1), fallback requires ≥2 of (webkit APIs, standalone mode, mobile screen).
- **`isMobile()`** — Returns true if `isIOS()`, or UA matches mobile patterns, or ≥2 of (domofilter/domovariable globals, touch support, mobile screen dimensions).

## domoutils.ts — DOM & Header Utilities

- **`setContentHeaders(headers, options?)`** — Sets `Content-Type` to `application/json` by default. If `options.contentType === "multipart"`, skips entirely (lets browser set boundary). Otherwise uses `options.contentType`.
- **`setAuthTokenHeader(headers, token)`** — Sets `X-DOMO-Ryuu-Session` header if token is truthy; removes it otherwise. Two arguments.
- **`setResponseType(req, options?)`** — Sets `XMLHttpRequest.responseType` (legacy, not used by current fetch-based HTTP service).
- **`handleNode(node, token)`** — Processes a DOM element: if it's `document.body` or `document.head`, recurses via `processBody`. Otherwise checks `data-domo-href`/`data-domo-src` or `href`/`src` attributes; if URL is relative and doesn't already contain token, appends `ryuu_sid` query param.
- **`processBody(node, token)`** — Iterates `node.children` and calls `handleNode` on each.

## data-helpers.ts — Format Conversion

- **`domoFormatToRequestFormat(format)`** — Maps user-facing `DomoDataFormats` strings (`'array-of-objects'`, `'array-of-arrays'`, `'csv'`, `'excel'`) to `DataFormats` enum values (MIME strings).

## filter.ts — Filter Type Guards

- **`isFilter(obj)`** — Type guard checking `column`, `operator` or `operand`, `values` array, and valid `dataType`/operator values. Accepts both `operator` and `operand` property names for mobile compat.
- **`isFilterArray(arr)`** — Array.every(isFilter).
- **`guardAgainstInvalidFilters(filters)`** — Allows `null` (passthrough). Throws `TypeError` on non-array, allows empty array (clears filters), validates each element via `isFilterArray`.

## variable.ts — Variable Type Guards

- **`isVariable(obj)`** — Checks `functionId` is number and `value` property exists.
- **`isVariableArray(arr)`** — Array.every(isVariable).
- **`guardAgainstInvalidVariables(variables)`** — Accepts `string | Variable[]`. Parses JSON strings. Throws on invalid JSON, non-Variable arrays, or empty arrays.
