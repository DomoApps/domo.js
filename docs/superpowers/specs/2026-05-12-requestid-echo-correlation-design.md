# RequestId Echo Correlation — SDK API + Demo Tests

**Date:** 2026-05-12
**Jira:** DOMO-483472 (upstream — DomoWeb PR [#57290](https://github.com/domo-development/DomoWeb/pull/57290))
**Status:** Approved (brainstorm phase)

## Background

DomoWeb PR #57290 propagates an opaque `req_<uuid>`-shaped correlation id ("requestId") through its JSON-RPC channel and iframe bridge so embed hosts can distinguish *host-initiated* appData/filter updates from *round-trip echoes* of the host's own apply calls.

The slice that crosses into ryuu.js' world:

| Direction | Before | After |
|---|---|---|
| Host → iframe `OutgoingEvent.APP_DATA` | `{appData}` | `{appData, requestId?}` |
| iframe → host `IncomingEvent.APP_DATA` | `{appData}` | iframe may echo `requestId` back |
| Same pattern on filter applies / `V1_ON_FILTERS_CHANGE` | — | — |

DomoWeb's `sanitizeRequestId` constrains the value to `^[A-Za-z0-9_\-:.]{1,128}$`. DomoWeb consumers are written tolerant of both the new `{payload, requestId}` and the legacy bare `payload` shape.

The current ryuu.js SDK:
- Has no place to surface a host-supplied requestId — `onAppDataUpdated`/`onFiltersUpdated` callbacks take only the payload.
- Has no way to send an echo requestId on outbound updates — `requestAppDataUpdate`/`requestFiltersUpdate` generate their own internal `requestId` for ACK tracking only.

## Goal

Add an **explicit API** to ryuu.js so apps can:
1. Receive a host-supplied requestId when the host pushes appData / filters.
2. Echo a requestId back to the host when sending an outbound update.

Plus add **demo instrumentation** (Event Monitor visibility + Test Suite category) so the behavior is observable and regression-tested.

## Non-Goals

- Auto-echo / silent stashing in the SDK — apps remain in control.
- Variables — host PR doesn't extend echo correlation to variable applies; out of scope.
- Changes to ACK/REPLY tracking — the SDK's existing internal `requestId` field stays exactly as-is.

## API Surface

### `src/models/services/appdata.ts`

```ts
// Inbound: optional 2nd arg
export function onAppDataUpdated(
  callback: (appData: string, requestId?: string) => void,
): () => void;

// Outbound: opts bag in 4th slot
interface AppDataUpdateOptions {
  echoRequestId?: string;
}

export function requestAppDataUpdate(
  appData: string,
  onAck?: OnAckCallback,
  onReply?: OnReplyCallback,
  opts?: AppDataUpdateOptions,
): void;
```

### `src/models/services/filters.ts`

```ts
// Inbound: optional 2nd arg
export function onFiltersUpdated(
  callback: (filters: Filter[], requestId?: string) => void,
): () => void;

// Outbound: opts bag as 5th positional (after pageStateUpdate, onAck, onReply)
interface FiltersUpdateOptions {
  echoRequestId?: string;
}

export function requestFiltersUpdate(
  filters: Filter[] | null,
  pageStateUpdate?: boolean,
  onAck?: OnAckCallback,
  onReply?: OnReplyCallback,
  opts?: FiltersUpdateOptions,
): void;
```

### Wire format

| Direction | Field | Notes |
|---|---|---|
| Inbound (host → SDK) | `message.requestId` | The SDK already reads this for its ACK-back. No wire change needed — just surface its value to the callback's 2nd arg. |
| Outbound (SDK → host) | `message.echoRequestId` | **NEW separate field**, distinct from the SDK's existing `message.requestId` (ACK/REPLY tracking). Keeps the two concerns disentangled. Additive — host ignores fields it doesn't read. |

### Validator: `src/utils/general.ts`

```ts
// Mirrors DomoWeb's sanitizeRequestId: ^[A-Za-z0-9_\-:.]{1,128}$
export function isValidEchoRequestId(value: unknown): value is string;
```

Invalid `echoRequestId` → throw `DomoValidationError` (consistent with `guardAgainstInvalidFilters` / `guardAgainstInvalidVariables`).

## Edge Cases & Decisions

| Case | Behavior |
|---|---|
| Host doesn't yet send `requestId` (pre-PR DomoWeb) | Callback 2nd arg is `undefined`. |
| Host sends `requestId` with characters outside the SDK's whitelist (defensive only — host PR sanitizes on its side) | SDK passes through verbatim. Host is the trust boundary; we don't double-sanitize inbound. |
| App passes `echoRequestId` failing the regex | Throw `DomoValidationError` before postMessage. |
| App passes both `echoRequestId` AND ACK callbacks | Unchanged ACK flow. SDK generates its own `requestId` for the ACK map; `echoRequestId` is a separate wire field. |
| Multiple inbound applies before SDK echoes | SDK doesn't auto-stash — explicit API means app code decides when/whether to echo. No stale-stash problem. |
| Legacy `window.postMessage` fallback path in `domo.ts` | Same callback signature change applies — host echo id surfaces via 2nd arg there too. |

## Debug Logging

`domoDebug.log('messages', ...)` already logs full payloads, so new `echoRequestId` field appears in logs automatically. Add one targeted log line in `requestAppDataUpdate` / `requestFiltersUpdate` when `echoRequestId` is set, under the `'messages'` category, so it surfaces in the demo's Event Monitor without expanding the payload.

## Demo Instrumentation

### Event Monitor (`demo/assets/js/event-monitor.js`)

Visible **requestId chip** distinct from the existing requestId display (which is the SDK's ACK-tracking id):

| Source | Chip text | Color |
|---|---|---|
| Inbound `message.requestId` matching `^req_[a-f0-9-]{36}$` | `host echo: req_abc…` | accent (teal) |
| Outbound `message.echoRequestId` | `echo→host: req_abc…` | same accent |
| Existing SDK ACK id | unchanged | neutral |

Add a checkbox filter **"host echo correlation"** that highlights pairs (inbound apply → outbound echo) by drawing a matching highlight ring when the same `req_xxx` appears on both sides within a short window.

### Test Suite (`demo/assets/js/test-suite.js`)

New **"Host Echo Correlation (DOMO-483472)"** category with 6 tests:

1. **`onAppDataUpdated receives requestId`** — register listener, synthesize inbound message `{event: 'appData', appData: 'x', requestId: 'req_test_123'}` via SDK's MessageChannel, assert callback called with `('x', 'req_test_123')`.
2. **`onAppDataUpdated tolerates missing requestId`** — same as #1 but no requestId; callback receives `(appData, undefined)`.
3. **`requestAppDataUpdate emits echoRequestId on wire`** — call with `{echoRequestId: 'req_xyz'}`, capture postMessage, assert wire has `echoRequestId: 'req_xyz'` AND a separate `requestId` (SDK's ACK id).
4. **`requestAppDataUpdate rejects invalid echoRequestId`** — pass `'<script>'`, expect `DomoValidationError` thrown.
5. **`onFiltersUpdated receives requestId`** — parallel of #1 for filters.
6. **`requestFiltersUpdate emits echoRequestId on wire`** — parallel of #3 for filters.

### Test harness: synthetic inbound dispatch

Tests #1, #2, #5 need to inject a fake incoming message. Approach: post to `domo.channel.port2.postMessage({...})` from inside the iframe — the SDK's own MessageChannel; no DomoWeb cooperation required. Works whether or not the host PR is deployed.

### Config / manifest

- `demo/assets/js/config.js` — add category metadata entry.
- `demo/manifest.json` — **no changes**; no new dataset/collection/workflow aliases.

## Rollout / Compatibility

- **Callback signature**: optional 2nd arg — all 1-arg callbacks keep working.
- **`requestAppDataUpdate` 4th opts arg / `requestFiltersUpdate` 5th opts arg**: backward-compatible — existing call sites unaffected.
- **Wire format**: new outbound `echoRequestId` is additive; host ignores unknown fields. Inbound is unchanged on the wire.
- **Existing 235 Jest tests**: should still pass without modification.

## Files Touched

**SDK:**
- `src/models/services/appdata.ts` — callback sig + opts param
- `src/models/services/filters.ts` — callback sig + opts param
- `src/utils/general.ts` — `isValidEchoRequestId` helper
- `src/domo.ts` — `DomoListeners.onAppDataUpdated` / `.onFiltersUpdated` typing update
- `src/models/services/appdata.test.ts`, `.../filters.test.ts` — new Jest cases for inbound surfacing + outbound wire emission
- `src/utils/general.test.ts` — tests for `isValidEchoRequestId`

**Demo:**
- `demo/assets/js/event-monitor.js` — chip rendering, color, optional correlation-highlight filter
- `demo/assets/js/test-suite.js` — new "Host Echo Correlation (DOMO-483472)" category with 6 tests
- `demo/assets/js/config.js` — category metadata entry

**Docs:**
- `CLAUDE.md` — note `echoRequestId` in the New APIs table and gotchas list
- `src/models/CLAUDE.md` — `echoRequestId` in the wire-format notes; updated callback signatures
- `demo/CLAUDE.md` — new test category in the Test Suite list

## Open Questions

None — all dimensions settled during brainstorming.
