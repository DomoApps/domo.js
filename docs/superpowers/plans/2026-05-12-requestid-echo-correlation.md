# RequestId Echo Correlation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface DomoWeb's host-supplied `requestId` to ryuu.js consumers via an optional 2nd callback arg, and accept an `echoRequestId` opts field on outbound `requestAppDataUpdate` / `requestFiltersUpdate` so apps can echo it back. Adds matching demo Event Monitor visibility and a Test Suite category.

**Architecture:** Two service files (`appdata.ts`, `filters.ts`) gain an opts bag and pass a new wire field `echoRequestId` (separate from the SDK's existing ACK-tracking `requestId`). Handlers read `message.requestId` from the inbound message and pass it as the callback's 2nd arg. A small `isValidEchoRequestId` predicate in `utils/general.ts` mirrors DomoWeb's `sanitizeRequestId` regex. Demo additions: Event Monitor renders a teal `host echo: req_…` / `echo→host: req_…` chip; Test Suite gains a "Host Echo Correlation (DOMO-483472)" category with 6 tests, three of which synthesize inbound messages by posting directly to `domo.channel.port2`.

**Tech Stack:** TypeScript, Webpack 5 UMD bundle, Jest+jsdom, vanilla JS demo app.

**Spec:** `docs/superpowers/specs/2026-05-12-requestid-echo-correlation-design.md`

---

### Task 1: `isValidEchoRequestId` helper

**Files:**
- Modify: `src/utils/general.ts` (append new export)
- Modify: `src/utils/general.test.ts` (append new describe block)

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/general.test.ts` (after the existing imports / describe blocks):

```typescript
import { isValidEchoRequestId } from './general';

describe('isValidEchoRequestId', () => {
  it('accepts uuid-shaped req_-prefixed ids', () => {
    expect(isValidEchoRequestId('req_a1b2c3d4-e5f6-7890-abcd-1234567890ab')).toBe(true);
  });

  it('accepts short alphanumeric ids', () => {
    expect(isValidEchoRequestId('abc123')).toBe(true);
  });

  it('accepts ids containing allowed punctuation (_ - : .)', () => {
    expect(isValidEchoRequestId('req-id_1.2:3')).toBe(true);
  });

  it('returns false for non-string inputs', () => {
    expect(isValidEchoRequestId(undefined)).toBe(false);
    expect(isValidEchoRequestId(null)).toBe(false);
    expect(isValidEchoRequestId(42)).toBe(false);
    expect(isValidEchoRequestId({ toString: () => 'req_1' })).toBe(false);
    expect(isValidEchoRequestId(['req_1'])).toBe(false);
    expect(isValidEchoRequestId(true)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidEchoRequestId('')).toBe(false);
  });

  it('accepts ids exactly 128 chars and rejects longer', () => {
    const max = 'a'.repeat(128);
    expect(isValidEchoRequestId(max)).toBe(true);
    expect(isValidEchoRequestId('a'.repeat(129))).toBe(false);
  });

  it('rejects whitespace and control characters', () => {
    expect(isValidEchoRequestId('req 1')).toBe(false);
    expect(isValidEchoRequestId('req\t1')).toBe(false);
    expect(isValidEchoRequestId('req\n1')).toBe(false);
    expect(isValidEchoRequestId('req\x001')).toBe(false);
  });

  it('rejects HTML/JS-sensitive characters', () => {
    expect(isValidEchoRequestId('<script>')).toBe(false);
    expect(isValidEchoRequestId('"><img')).toBe(false);
    expect(isValidEchoRequestId("req';drop")).toBe(false);
    expect(isValidEchoRequestId('req&id=1')).toBe(false);
    expect(isValidEchoRequestId('req/1')).toBe(false);
    expect(isValidEchoRequestId('req\\1')).toBe(false);
  });

  it('rejects non-ASCII characters', () => {
    expect(isValidEchoRequestId('req_café')).toBe(false);
    expect(isValidEchoRequestId('req_测试')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx jest src/utils/general.test.ts --silent
```

Expected: tests fail with "isValidEchoRequestId is not a function" (or compile error: not exported).

- [ ] **Step 3: Implement `isValidEchoRequestId`**

Append to `src/utils/general.ts`:

```typescript
/**
 * Whitelist regex for echo-request correlation ids — mirrors DomoWeb's
 * `sanitizeRequestId` (see DomoWeb PR #57290, DOMO-483472).
 * Allowed: alphanumerics plus `_ - : .` ; length 1–128.
 */
const ECHO_REQUEST_ID_PATTERN = /^[A-Za-z0-9_\-:.]{1,128}$/;

/**
 * Validates a host-correlation `echoRequestId` value before placing it on
 * the wire. Returns `true` when the value is a non-empty string of at most
 * 128 chars limited to `[A-Za-z0-9_\-:.]`.
 */
export function isValidEchoRequestId(value: unknown): value is string {
  return typeof value === 'string' && ECHO_REQUEST_ID_PATTERN.test(value);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx jest src/utils/general.test.ts --silent
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/general.ts src/utils/general.test.ts
git commit -m "$(cat <<'EOF'
Add isValidEchoRequestId helper (DOMO-483472)

Mirrors DomoWeb's sanitizeRequestId whitelist (^[A-Za-z0-9_\-:.]{1,128}$).
Used to guard outbound echoRequestId values before wire transmission.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: appdata — surface inbound `requestId` to callbacks

**Files:**
- Modify: `src/models/services/appdata.ts:60-73` (handleAppData)
- Modify: `src/models/services/appdata.test.ts` (add test + update existing)

- [ ] **Step 1: Write the failing tests AND update the existing appData test for strict-arg match**

Jest's `toHaveBeenCalledWith` is length-strict — once `handleAppData` always invokes the callback with two args, the existing `'should handle appData event'` assertion `toHaveBeenCalledWith(appData)` would fail. Update it first.

In `src/models/services/appdata.test.ts`, find the existing test (around line 45-54):

```typescript
  it('should handle appData event', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    const appData = { foo: 'bar' };
    Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'appData', appData }, [port]));
    expect(port.postMessage).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(appData);
  });
```

Replace the final assertion with the 2-arg form:

```typescript
  it('should handle appData event', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    const appData = { foo: 'bar' };
    Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'appData', appData }, [port]));
    expect(port.postMessage).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(appData, undefined);
  });
```

Then add the two new tests just below it:

```typescript
  it('passes message.requestId as callback 2nd arg (DOMO-483472 inbound)', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    const appData = 'host-pushed';
    const requestId = 'req_host_echo_1';
    Domo.channel?.port1.onmessage?.(makeMessageEvent(
      { event: 'appData', appData, requestId },
      [port],
    ));
    expect(cb).toHaveBeenCalledWith(appData, requestId);
  });

  it('passes undefined as 2nd arg when message has no requestId', () => {
    const cb = jest.fn();
    Domo.onAppDataUpdated(cb);
    (Domo as any).connect();
    const port = makeMockPort();
    Domo.channel?.port1.onmessage?.(makeMessageEvent(
      { event: 'appData', appData: 'x' },
      [port],
    ));
    expect(cb).toHaveBeenCalledWith('x', undefined);
  });
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npx jest src/models/services/appdata.test.ts --silent
```

Expected: the existing 'should handle appData event' test still passes (it asserts `cb).toHaveBeenCalledWith(appData)` and Jest matches that prefix even when called with `(appData, undefined)`). The new tests fail because cb is currently invoked with one arg only — `toHaveBeenCalledWith(appData, requestId)` requires the second arg.

- [ ] **Step 3: Update `handleAppData` to forward requestId**

Replace the body of `handleAppData` in `src/models/services/appdata.ts` (currently lines 60-73):

```typescript
export function handleAppData(message: any, responsePort?: MessagePort) {
  if (!message) return;

  if (this.listeners.onAppDataUpdated.length) {
    const ack = { requestId: message.requestId, event: "ack" };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    this.listeners.onAppDataUpdated.forEach(
      (cb: (appData: string, requestId?: string) => void) =>
        cb(message.appData, message.requestId)
    );
  }

  this.handleReply(message.requestId, message.appData, message.error);
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
npx jest src/models/services/appdata.test.ts --silent
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/models/services/appdata.ts src/models/services/appdata.test.ts
git commit -m "$(cat <<'EOF'
Surface host requestId on onAppDataUpdated callback (DOMO-483472)

handleAppData now forwards message.requestId as the callback's optional
2nd arg, so apps can correlate host-initiated pushes with their own
echo response.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: appdata — accept `echoRequestId` opts on outbound

**Files:**
- Modify: `src/models/services/appdata.ts:1-34` (imports + requestAppDataUpdate)
- Modify: `src/models/services/appdata.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('sendAppData', ...)` block:

```typescript
  it('emits echoRequestId on wire when provided (DOMO-483472 outbound)', () => {
    window.parent.postMessage = jest.fn();
    (Domo as any).requestAppDataUpdate('payload', undefined, undefined, {
      echoRequestId: 'req_xyz_test',
    });
    expect(window.parent.postMessage).toHaveBeenCalled();
    const wire = JSON.parse(
      (window.parent.postMessage as jest.Mock).mock.calls[0][0],
    );
    expect(wire.echoRequestId).toBe('req_xyz_test');
    // SDK's own ACK-tracking requestId remains distinct.
    expect(wire.requestId).toBeDefined();
    expect(wire.requestId).not.toBe('req_xyz_test');
  });

  it('does not add echoRequestId field when opts omits it', () => {
    window.parent.postMessage = jest.fn();
    (Domo as any).requestAppDataUpdate('payload');
    const wire = JSON.parse(
      (window.parent.postMessage as jest.Mock).mock.calls[0][0],
    );
    expect(wire).not.toHaveProperty('echoRequestId');
  });

  it('throws DomoValidationError for invalid echoRequestId', () => {
    const { DomoValidationError } = require('../errors');
    expect(() =>
      (Domo as any).requestAppDataUpdate('payload', undefined, undefined, {
        echoRequestId: '<script>',
      }),
    ).toThrow(DomoValidationError);
    expect(() =>
      (Domo as any).requestAppDataUpdate('payload', undefined, undefined, {
        echoRequestId: '',
      }),
    ).toThrow(DomoValidationError);
    expect(() =>
      (Domo as any).requestAppDataUpdate('payload', undefined, undefined, {
        echoRequestId: 'a'.repeat(129),
      }),
    ).toThrow(DomoValidationError);
  });
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npx jest src/models/services/appdata.test.ts --silent
```

Expected: the three new tests fail — `wire.echoRequestId` is undefined, and the invalid-input test throws nothing (the opts arg is silently ignored today).

- [ ] **Step 3: Replace `requestAppDataUpdate` implementation**

Replace the entire `requestAppDataUpdate` function in `src/models/services/appdata.ts` (currently lines 13-34):

```typescript
import { generateUniqueId, isValidEchoRequestId } from "../../utils/general";
import { domoDebug } from "../../utils/debug";
import { OnAckCallback, OnReplyCallback } from "../interfaces/ask-reply";
import { DomoValidationError } from "../errors";

export interface AppDataUpdateOptions {
  /**
   * Opaque correlation id supplied by the embed host on a recent inbound
   * appData apply. When set, the SDK emits it as a separate `echoRequestId`
   * field on the outbound payload so the host can match the echo to its
   * original apply. Must match `^[A-Za-z0-9_\-:.]{1,128}$`.
   */
  echoRequestId?: string;
}

/**
 * Sends app data to the parent window.
 *
 * @this {Domo} - The Domo instance context.
 * @param appData - The app data to send, as a string.
 * @param onAck - Optional callback to invoke when the message is acknowledged.
 * @param onReply - Optional callback to invoke when a reply is received.
 * @param opts - Optional bag; `opts.echoRequestId` echoes a host correlation id back on the wire.
 */
export function requestAppDataUpdate(
  appData: string,
  onAck?: OnAckCallback,
  onReply?: OnReplyCallback,
  opts?: AppDataUpdateOptions,
) {
  if (opts?.echoRequestId !== undefined && !isValidEchoRequestId(opts.echoRequestId)) {
    throw new DomoValidationError(
      'Invalid echoRequestId — must be a string of 1-128 chars matching [A-Za-z0-9_\\-:.]',
      [opts.echoRequestId],
    );
  }

  const requestId = generateUniqueId();

  const payload: {
    requestId: string;
    event: string;
    appData: string;
    echoRequestId?: string;
  } = {
    requestId,
    event: "appData",
    appData,
  };

  if (opts?.echoRequestId !== undefined) {
    payload.echoRequestId = opts.echoRequestId;
  }

  this.requests[requestId] = {
    request: {
      payload,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  domoDebug.log('messages', 'sent:postMessage', 'appData', payload);
  window.parent.postMessage(JSON.stringify(payload), "*");
}
```

Note: the existing `onAppDataUpdated` and `handleAppData` exports stay; only `requestAppDataUpdate` and the import block change. The full file should retain its existing `onAppDataUpdated` and the `handleAppData` from Task 2.

- [ ] **Step 4: Run tests, verify all pass**

```bash
npx jest src/models/services/appdata.test.ts --silent
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/models/services/appdata.ts src/models/services/appdata.test.ts
git commit -m "$(cat <<'EOF'
Accept echoRequestId opts on requestAppDataUpdate (DOMO-483472)

When opts.echoRequestId is provided, emit it as a separate wire field
distinct from the SDK's existing ACK-tracking requestId. Throw
DomoValidationError for values that fail the [A-Za-z0-9_\-:.]{1,128}
whitelist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: filters — surface inbound `requestId` to callbacks

**Files:**
- Modify: `src/models/services/filters.ts:98-112` (handleFiltersUpdated)
- Modify: `src/models/services/filters.test.ts` (add tests + update existing)
- Modify: `src/domo.test.ts:358, :416` (update two more strict-arg assertions on filter callbacks)

- [ ] **Step 1: Write the failing tests AND update the existing filtersUpdated test for strict-arg match**

Same reason as Task 2 — Jest's length-strict matching means the existing 1-arg assertion will break once the handler always passes 2 args. Update it first.

Find the existing test in `describe('onFiltersUpdated', ...)` (around line 154-162):

```typescript
    it('should handle filtersUpdated event', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdated(cb);
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'filtersUpdated', filters }, [port]));
      expect(port.postMessage).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(filters);
    });
```

Replace the final assertion:

```typescript
    it('should handle filtersUpdated event', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdated(cb);
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'filtersUpdated', filters }, [port]));
      expect(port.postMessage).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(filters, undefined);
    });
```

Then inside `describe('onFiltersUpdated', ...)` add the two new tests below it:

```typescript
    it('passes message.requestId as callback 2nd arg (DOMO-483472 inbound)', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdated(cb);
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      const requestId = 'req_host_filter_1';
      Domo.channel?.port1.onmessage?.(makeMessageEvent(
        { event: 'filtersUpdated', filters, requestId },
        [port],
      ));
      expect(cb).toHaveBeenCalledWith(filters, requestId);
    });

    it('passes undefined as 2nd arg when filters message has no requestId', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdated(cb);
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      Domo.channel?.port1.onmessage?.(makeMessageEvent(
        { event: 'filtersUpdated', filters },
        [port],
      ));
      expect(cb).toHaveBeenCalledWith(filters, undefined);
    });
```

Then update the two strict-arg assertions in `src/domo.test.ts`. Find:

```typescript
    expect(spy).toHaveBeenCalledWith([{ column: 'x' }]);
```

(in the test `'should handle standard event-based messages'` near line 358). The synthesized message has `requestId: 'r1'`, so update to:

```typescript
    expect(spy).toHaveBeenCalledWith([{ column: 'x' }], 'r1');
```

And find:

```typescript
    expect(spy).toHaveBeenCalledWith([]);
```

(in the test `'should handle object data (non-string)'` near line 416). The synthesized message omits requestId, so update to:

```typescript
    expect(spy).toHaveBeenCalledWith([], undefined);
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npx jest src/models/services/filters.test.ts --silent
```

Expected: the new tests fail — callback currently only receives `(filters)`.

- [ ] **Step 3: Update `handleFiltersUpdated`**

Replace the `handleFiltersUpdated` function in `src/models/services/filters.ts` (currently lines 98-112):

```typescript
export function handleFiltersUpdated(message: any, responsePort?: MessagePort): void {
  if (!message) return;

  if (this.listeners.onFiltersUpdated.length) {
    domoDebug.log('filters', 'filtersUpdated', message.filters);
    const ack = { requestId: message.requestId, event: "ack", filters: message.filters };
    domoDebug.log('messages', 'sent:ack:channel', 'ack', ack);
    responsePort?.postMessage(ack);
    this.listeners.onFiltersUpdated.forEach(
      (cb: (filters: Filter[], requestId?: string) => void) =>
        cb(message.filters, message.requestId)
    );
  }

  this.handleReply(message.requestId, message.filters, message.error);
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
npx jest src/models/services/filters.test.ts --silent
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/models/services/filters.ts src/models/services/filters.test.ts src/domo.test.ts
git commit -m "$(cat <<'EOF'
Surface host requestId on onFiltersUpdated callback (DOMO-483472)

handleFiltersUpdated now forwards message.requestId as the callback's
optional 2nd arg, parallel to the appData change. Updates two strict-arg
assertions in domo.test.ts for the legacy postMessage path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: filters — accept `echoRequestId` opts on outbound

**Files:**
- Modify: `src/models/services/filters.ts:1-64` (imports + requestFiltersUpdate)
- Modify: `src/models/services/filters.test.ts` (add `describe('echoRequestId', ...)` block)

- [ ] **Step 1: Write the failing tests**

At the end of the top-level `describe('Filters Service', ...)` block in `src/models/services/filters.test.ts` (just before the final closing `});`), add a new describe block:

```typescript
  describe('echoRequestId (DOMO-483472 outbound)', () => {
    it('emits echoRequestId on wire when provided', () => {
      const filters = [
        { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING },
      ];
      (Domo as any).requestFiltersUpdate(filters, null, undefined, undefined, {
        echoRequestId: 'req_filter_echo_1',
      });
      const wire = JSON.parse((window.parent.postMessage as jest.Mock).mock.calls[0][0]);
      expect(wire.echoRequestId).toBe('req_filter_echo_1');
      expect(wire.requestId).toBeDefined();
      expect(wire.requestId).not.toBe('req_filter_echo_1');
    });

    it('does not add echoRequestId field when opts omits it', () => {
      const filters = [
        { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING },
      ];
      Domo.requestFiltersUpdate(filters);
      const wire = JSON.parse((window.parent.postMessage as jest.Mock).mock.calls[0][0]);
      expect(wire).not.toHaveProperty('echoRequestId');
    });

    it('throws DomoValidationError for invalid echoRequestId', () => {
      const filters = [
        { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING },
      ];
      expect(() =>
        (Domo as any).requestFiltersUpdate(filters, null, undefined, undefined, {
          echoRequestId: '<script>',
        }),
      ).toThrow(DomoValidationError);
      expect(() =>
        (Domo as any).requestFiltersUpdate(filters, null, undefined, undefined, {
          echoRequestId: '',
        }),
      ).toThrow(DomoValidationError);
      expect(() =>
        (Domo as any).requestFiltersUpdate(filters, null, undefined, undefined, {
          echoRequestId: 'a'.repeat(129),
        }),
      ).toThrow(DomoValidationError);
    });
  });
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
npx jest src/models/services/filters.test.ts --silent
```

Expected: the new tests fail — extra opts arg is silently ignored today.

- [ ] **Step 3: Update `requestFiltersUpdate` signature + implementation**

In `src/models/services/filters.ts`:

a) Replace the top imports block (currently lines 1-6) with:

```typescript
import { generateUniqueId, isValidEchoRequestId } from "../../utils/general";
import { sendToParent } from "../../utils/messaging";
import { guardAgainstInvalidFilters } from "../../utils/filter";
import { Filter } from "../interfaces/filter";
import { OnAckCallback, OnReplyCallback } from "../interfaces/ask-reply";
import { DomoValidationError } from "../errors";
import { domoDebug } from "../../utils/debug";
```

b) Replace the `requestFiltersUpdate` function (currently lines 17-64) with:

```typescript
export interface FiltersUpdateOptions {
  /**
   * Opaque correlation id supplied by the embed host on a recent inbound
   * filter apply. When set, the SDK emits it as a separate `echoRequestId`
   * field on the outbound payload so the host can match the echo to its
   * original apply. Must match `^[A-Za-z0-9_\-:.]{1,128}$`.
   */
  echoRequestId?: string;
}

/**
 * Sends filter data to the parent window or to the iOS webkit message handler.
 *
 * @this {Domo} - The Domo instance context.
 * @param filters - An array of Filter objects or null.
 * @param pageStateUpdate - Optional boolean indicating if the page state should be updated.
 * @param onAck - Callback function to be called when the filters are acknowledged.
 * @param onReply - Callback function to be called when the filters are replied.
 * @param opts - Optional bag; `opts.echoRequestId` echoes a host correlation id back on the wire.
 */
export function requestFiltersUpdate(
  filters: Filter[] | null,
  pageStateUpdate: boolean | null = null,
  onAck?: OnAckCallback,
  onReply?: OnReplyCallback,
  opts?: FiltersUpdateOptions,
): string {
  guardAgainstInvalidFilters(filters);

  if (opts?.echoRequestId !== undefined && !isValidEchoRequestId(opts.echoRequestId)) {
    throw new DomoValidationError(
      'Invalid echoRequestId — must be a string of 1-128 chars matching [A-Za-z0-9_\\-:.]',
      [opts.echoRequestId],
    );
  }

  const requestId = generateUniqueId();

  const desktopPayload: {
    requestId: string;
    event: string;
    filter: any;
    pageStateUpdate: boolean | null;
    echoRequestId?: string;
  } = {
    requestId,
    event: "filter",
    filter: filters?.map((filter) => ({
      columnName: filter.column,
      operator: filter.operator ?? (filter as any).operand,
      values: filter.values,
      dataType: filter.dataType,
    })),
    pageStateUpdate,
  };

  if (opts?.echoRequestId !== undefined) {
    desktopPayload.echoRequestId = opts.echoRequestId;
  }

  this.requests[requestId] = {
    request: {
      payload: desktopPayload,
      onAck,
      onReply,
      status: "pending",
      sentAt: Date.now(),
    },
  };

  const mobileFilters = filters?.map((filter) => ({
    column: filter.column,
    operand: filter.operator || (filter as any).operand,
    values: filter.values,
    dataType: filter.dataType,
  }));

  sendToParent(
    'filter',
    desktopPayload,
    'domofilter',
    JSON.stringify(mobileFilters),
    mobileFilters
  );

  return requestId;
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
npx jest src/models/services/filters.test.ts --silent
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/models/services/filters.ts src/models/services/filters.test.ts
git commit -m "$(cat <<'EOF'
Accept echoRequestId opts on requestFiltersUpdate (DOMO-483472)

5th positional opts bag carries echoRequestId; emitted as a separate
wire field. Validated against the [A-Za-z0-9_\-:.]{1,128} whitelist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update `DomoListeners` typing

**Files:**
- Modify: `src/domo.ts:37-43`

- [ ] **Step 1: Update the interface**

Replace the `DomoListeners` interface (currently lines 37-43):

```typescript
export interface DomoListeners {
  onDataUpdated: ((alias: string) => void)[];
  onFiltersUpdated: ((filters: Filter[], requestId?: string) => void)[];
  onAppDataUpdated: ((appData: string, requestId?: string) => void)[];
  onVariablesUpdated: ((variables: Variable[]) => void)[];
  [key: string]: Function[];
}
```

- [ ] **Step 2: Run type check + full Jest suite**

```bash
npx tsc --noEmit --skipLibCheck && npm test
```

Expected: type check passes, all 235+ tests pass (existing tests use 1-arg callbacks; the optional 2nd arg is backward-compatible).

- [ ] **Step 3: Commit**

```bash
git add src/domo.ts
git commit -m "$(cat <<'EOF'
Type onFiltersUpdated/onAppDataUpdated callbacks with optional requestId (DOMO-483472)

Adds optional 2nd arg to the listener callback types in DomoListeners.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Build the SDK bundle for the demo

**Files:**
- Modify: `dist/domo.js` (generated)
- Modify: `demo/domo.js` (generated; copy of dist/domo.js used by demo)

- [ ] **Step 1: Run the production build**

```bash
npm run build
```

Expected: webpack writes `dist/domo.js`. No errors.

- [ ] **Step 2: Copy bundle into demo**

The demo loads `demo/domo.js` (a pinned copy used by `build.js`). Refresh it from dist:

```bash
cp dist/domo.js demo/domo.js
```

- [ ] **Step 3: Quick sanity check**

```bash
grep -c 'echoRequestId' demo/domo.js
```

Expected: at least 3 hits (interface + appdata + filters references).

- [ ] **Step 4: Commit**

```bash
git add dist/domo.js demo/domo.js
git commit -m "$(cat <<'EOF'
Rebuild SDK bundle with echoRequestId support (DOMO-483472)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Event Monitor — render host-echo chips

**Files:**
- Modify: `demo/assets/js/event-monitor.js:236-305` (`_captureDebugEvent`, `_captureEvent`)
- Modify: `demo/assets/js/event-monitor.js:320-352` (entry rendering inside `_renderFeed`)
- Modify: `demo/assets/css/styles.css` (existing `.event-entry__id` rule is at line ~2008)

- [ ] **Step 1: Update event capture to extract echoRequestId**

In `demo/assets/js/event-monitor.js`, find the inbound capture block (around line 243):

```javascript
      var requestId = (payload && typeof payload === 'object') ? payload.requestId : null;
      this._captureEvent({ direction: 'in', eventType: eventType, requestId: requestId, payload: payload, source: source });
      return;
```

Replace with:

```javascript
      var requestId = (payload && typeof payload === 'object') ? payload.requestId : null;
      var echoId = (payload && typeof payload === 'object') ? payload.echoRequestId : null;
      this._captureEvent({ direction: 'in', eventType: eventType, requestId: requestId, echoRequestId: echoId, payload: payload, source: source });
      return;
```

Find the outbound capture block (around line 264):

```javascript
      var requestId = (payload && typeof payload === 'object') ? payload.requestId : null;
      this._captureEvent({ direction: 'out', eventType: eventType, requestId: requestId, payload: payload, source: source });
      return;
```

Replace with:

```javascript
      var requestId = (payload && typeof payload === 'object') ? payload.requestId : null;
      var echoId = (payload && typeof payload === 'object') ? payload.echoRequestId : null;
      this._captureEvent({ direction: 'out', eventType: eventType, requestId: requestId, echoRequestId: echoId, payload: payload, source: source });
      return;
```

Then update `_captureEvent` (around line 284-294) to store the new field. Replace:

```javascript
  _captureEvent(eventData) {
    var entry = {
      id: 'evt-' + (++this._counter),
      timestamp: new Date(),
      direction: eventData.direction || 'in',
      eventType: eventData.eventType || 'unknown',
      requestId: eventData.requestId || null,
      payload: eventData.payload,
      source: eventData.source || null,
      expanded: false,
    };
```

With:

```javascript
  _captureEvent(eventData) {
    var entry = {
      id: 'evt-' + (++this._counter),
      timestamp: new Date(),
      direction: eventData.direction || 'in',
      eventType: eventData.eventType || 'unknown',
      requestId: eventData.requestId || null,
      echoRequestId: eventData.echoRequestId || null,
      payload: eventData.payload,
      source: eventData.source || null,
      expanded: false,
    };
```

- [ ] **Step 2: Render the chip**

In `_renderFeed`, find the row-rendering block (around line 332-344):

```javascript
      var idStr = entry.requestId ? entry.requestId.substring(0, 20) + (entry.requestId.length > 20 ? '...' : '') : '';

      // Only animate genuinely new entries, not re-renders
      var animClass = isNew ? '' : ' event-entry--no-anim';
      html += '<div class="event-entry ' + dirClass + animClass + '" data-id="' + entry.id + '">';
      html += '<div class="event-entry__row">';
      html += '<span class="event-entry__time">' + time + '</span>';
      html += '<span class="event-entry__arrow ' + arrowClass + '">' + arrow + '</span>';
      html += '<span class="event-entry__type">' + DataRenderer.escapeHTML(entry.eventType) + '</span>';
      if (entry.source) html += '<span class="event-entry__source event-entry__source--' + (entry.source === 'MessageChannel' ? 'channel' : 'post') + '">' + DataRenderer.escapeHTML(entry.source) + '</span>';
      if (idStr) html += '<span class="event-entry__id">' + DataRenderer.escapeHTML(idStr) + '</span>';
      html += '<span class="event-entry__expand-hint">' + (entry.expanded ? '▲' : '▼') + '</span>';
      html += '</div>';
```

Replace with:

```javascript
      var idStr = entry.requestId ? entry.requestId.substring(0, 20) + (entry.requestId.length > 20 ? '...' : '') : '';
      var echoIdStr = entry.echoRequestId ? entry.echoRequestId.substring(0, 24) + (entry.echoRequestId.length > 24 ? '...' : '') : '';
      // Host echo correlation chip — distinct from the SDK's ACK requestId.
      // - inbound message with requestId: chip shows the host's correlation id ("host echo: ...")
      // - outbound message with echoRequestId: chip shows the value being echoed back ("echo->host: ...")
      var hostChipText = '';
      if (entry.direction === 'in' && entry.requestId) {
        hostChipText = 'host echo: ' + entry.requestId.substring(0, 20) + (entry.requestId.length > 20 ? '...' : '');
      } else if (entry.direction === 'out' && entry.echoRequestId) {
        hostChipText = 'echo' + '→' + 'host: ' + echoIdStr;
      }

      // Only animate genuinely new entries, not re-renders
      var animClass = isNew ? '' : ' event-entry--no-anim';
      html += '<div class="event-entry ' + dirClass + animClass + '" data-id="' + entry.id + '">';
      html += '<div class="event-entry__row">';
      html += '<span class="event-entry__time">' + time + '</span>';
      html += '<span class="event-entry__arrow ' + arrowClass + '">' + arrow + '</span>';
      html += '<span class="event-entry__type">' + DataRenderer.escapeHTML(entry.eventType) + '</span>';
      if (entry.source) html += '<span class="event-entry__source event-entry__source--' + (entry.source === 'MessageChannel' ? 'channel' : 'post') + '">' + DataRenderer.escapeHTML(entry.source) + '</span>';
      // SDK's own ACK requestId chip — only show on OUTBOUND entries (where it's the SDK-generated id we track replies on).
      // On inbound entries, "requestId" is the host's echo correlation id and is shown by the host chip instead.
      if (entry.direction === 'out' && idStr) html += '<span class="event-entry__id">' + DataRenderer.escapeHTML(idStr) + '</span>';
      if (hostChipText) html += '<span class="event-entry__id event-entry__id--host-echo">' + DataRenderer.escapeHTML(hostChipText) + '</span>';
      html += '<span class="event-entry__expand-hint">' + (entry.expanded ? '▲' : '▼') + '</span>';
      html += '</div>';
```

- [ ] **Step 3: Add styling for the host-echo chip**

Append to `demo/assets/css/styles.css`:

```css
.event-entry__id--host-echo {
  background: rgba(20, 184, 166, 0.15);   /* teal-500 @ 15% */
  color: #5eead4;                          /* teal-300 */
  border: 1px solid rgba(20, 184, 166, 0.35);
}
```

The existing `.event-entry__id` rule (at ~line 2008) already supplies the base layout (`font-size`, `font-family`, ellipsis); the modifier just overrides colors.

- [ ] **Step 4: Manual smoke test**

```bash
npm run build:demo
```

Then open `demo/public-assets/index.html` in a browser (or load the deployed demo against a real Domo iframe). Switch to Event Monitor. Trigger a filter change on the host page — you should see a `host echo: req_…` chip on the inbound `filtersUpdated` entry. From the Test Suite tab, run `requestAppDataUpdate` with the upcoming test (Task 9) — you should see `echo→host: req_…` on the outbound entry.

If running outside a real Domo iframe and no host events occur, this step is informational only — proceed to Step 5.

- [ ] **Step 5: Commit**

```bash
git add demo/assets/js/event-monitor.js demo/assets/css/styles.css
git commit -m "$(cat <<'EOF'
Render host-echo correlation chips in Event Monitor (DOMO-483472)

Inbound entries with a requestId now display a teal "host echo:" chip
(treating the field as the host correlation id rather than the SDK
ACK id). Outbound entries with echoRequestId display "echo->host:".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Test Suite — new "Host Echo Correlation" category

**Files:**
- Modify: `demo/assets/js/config.js:50-60` (CATEGORY_META)
- Modify: `demo/assets/js/test-suite.js` (add tests)
- Modify: `demo/CLAUDE.md` (test suite list)

- [ ] **Step 1: Add category metadata**

In `demo/assets/js/config.js`, update the `CATEGORY_META` block (currently lines 50-60). Add one entry before the closing `};`:

```javascript
const CATEGORY_META = {
  data:       { icon: 'Q', label: 'Data API',         cssClass: 'data' },
  appdb:      { icon: 'D', label: 'AppDB',            cssClass: 'appdb' },
  events:     { icon: '~', label: 'Events',           cssClass: 'events' },
  codeengine: { icon: '>', label: 'Code Engine',      cssClass: 'codeengine' },
  workflow:   { icon: '%', label: 'Workflows',        cssClass: 'workflow' },
  ai:         { icon: '*', label: 'AI Services',      cssClass: 'ai' },
  utils:      { icon: '#', label: 'Utilities',        cssClass: 'utils' },
  params:     { icon: '?', label: 'URL Params',       cssClass: 'params' },
  dx:         { icon: '+', label: 'DX Tools',         cssClass: 'dx' },
  echo:       { icon: '@', label: 'Host Echo',        cssClass: 'events' },
};
```

(Reusing `cssClass: 'events'` so we don't have to add a new color theme.)

- [ ] **Step 2: Add the 6 tests**

Open `demo/assets/js/test-suite.js`, find the location just before the existing `// ── Code Engine ──` block (search for `// ── Code Engine`). Insert this new section directly above it:

```javascript
  // ── Host Echo Correlation (DOMO-483472) ──────────────────────────
  {
    name: "onAppDataUpdated receives host requestId",
    category: "echo",
    description: "Synthesize an inbound appData message and assert the listener gets (appData, requestId)",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.onAppDataUpdated !== "function") return reject(new Error("Not available in this version"));
      if (!domo.channel || !domo.channel.port1) return reject(new Error("MessageChannel not connected — open this app inside Domo"));
      var received = null;
      var unregister = domo.onAppDataUpdated(function(appData, requestId) {
        received = { appData: appData, requestId: requestId };
      });
      var port = new MessageChannel().port2;
      // Synthesize an inbound host push by dispatching directly on port1.onmessage.
      domo.channel.port1.onmessage({
        data: { event: "appData", appData: "synthetic-x", requestId: "req_synth_in_1" },
        ports: [port],
      });
      try { unregister(); } catch (e) {}
      if (!received) return reject(new Error("Callback did not fire"));
      if (received.appData !== "synthetic-x") return reject(new Error("appData mismatch: " + received.appData));
      if (received.requestId !== "req_synth_in_1") return reject(new Error("requestId 2nd arg missing or wrong: " + received.requestId));
      resolve({ _render: "payload", direction: "received", method: "onAppDataUpdated (synthetic)", payload: received });
    }),
  },
  {
    name: "onAppDataUpdated tolerates missing requestId",
    category: "echo",
    description: "Synthesize an inbound appData without requestId; 2nd arg should be undefined",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.onAppDataUpdated !== "function") return reject(new Error("Not available in this version"));
      if (!domo.channel || !domo.channel.port1) return reject(new Error("MessageChannel not connected — open this app inside Domo"));
      var received = null;
      var unregister = domo.onAppDataUpdated(function(appData, requestId) {
        received = { appData: appData, requestId: requestId };
      });
      var port = new MessageChannel().port2;
      domo.channel.port1.onmessage({
        data: { event: "appData", appData: "no-id" },
        ports: [port],
      });
      try { unregister(); } catch (e) {}
      if (!received) return reject(new Error("Callback did not fire"));
      if (received.appData !== "no-id") return reject(new Error("appData mismatch"));
      if (received.requestId !== undefined) return reject(new Error("requestId should be undefined, got: " + String(received.requestId)));
      resolve({ _render: "payload", direction: "received", method: "onAppDataUpdated (synthetic, no id)", payload: received });
    }),
  },
  {
    name: "requestAppDataUpdate emits echoRequestId on wire",
    category: "echo",
    description: "Capture window.parent.postMessage and assert echoRequestId is set distinct from requestId",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestAppDataUpdate !== "function") return reject(new Error("Not available in this version"));
      var originalPost = window.parent.postMessage;
      var captured = null;
      window.parent.postMessage = function(msg, origin) {
        try {
          var parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
          if (parsed && parsed.event === "appData" && !captured) captured = parsed;
        } catch (e) {}
        // Still deliver so we don't break the app.
        return originalPost.call(window.parent, msg, origin);
      };
      try {
        domo.requestAppDataUpdate("echo-test-payload", undefined, undefined, { echoRequestId: "req_echo_out_1" });
      } finally {
        window.parent.postMessage = originalPost;
      }
      if (!captured) return reject(new Error("No appData postMessage captured"));
      if (captured.echoRequestId !== "req_echo_out_1") return reject(new Error("echoRequestId missing or wrong: " + captured.echoRequestId));
      if (!captured.requestId) return reject(new Error("SDK ACK requestId missing"));
      if (captured.requestId === captured.echoRequestId) return reject(new Error("requestId and echoRequestId must be distinct"));
      resolve({ _render: "payload", direction: "sent", method: "requestAppDataUpdate", payload: captured });
    }),
  },
  {
    name: "requestAppDataUpdate rejects invalid echoRequestId",
    category: "echo",
    description: "Pass '<script>' as echoRequestId; expect DomoValidationError",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestAppDataUpdate !== "function") return reject(new Error("Not available in this version"));
      var threw = false;
      var errName = null;
      try {
        domo.requestAppDataUpdate("payload", undefined, undefined, { echoRequestId: "<script>" });
      } catch (e) {
        threw = true;
        errName = e && e.name;
      }
      if (!threw) return reject(new Error("Expected a throw, but call returned normally"));
      if (errName !== "DomoValidationError") return reject(new Error("Expected DomoValidationError, got: " + errName));
      resolve({ _render: "payload", direction: "sent", method: "requestAppDataUpdate", payload: { errorName: errName, input: "<script>" } });
    }),
  },
  {
    name: "onFiltersUpdated receives host requestId",
    category: "echo",
    description: "Synthesize an inbound filtersUpdated message; listener should get (filters, requestId)",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.onFiltersUpdated !== "function") return reject(new Error("Not available in this version"));
      if (!domo.channel || !domo.channel.port1) return reject(new Error("MessageChannel not connected — open this app inside Domo"));
      var received = null;
      var unregister = domo.onFiltersUpdated(function(filters, requestId) {
        received = { filters: filters, requestId: requestId };
      });
      var port = new MessageChannel().port2;
      var filters = [{ column: "x", operator: "IN", values: ["y"], dataType: "STRING" }];
      domo.channel.port1.onmessage({
        data: { event: "filtersUpdated", filters: filters, requestId: "req_synth_filter_1" },
        ports: [port],
      });
      try { unregister(); } catch (e) {}
      if (!received) return reject(new Error("Callback did not fire"));
      if (!Array.isArray(received.filters) || received.filters.length !== 1) return reject(new Error("filters not forwarded"));
      if (received.requestId !== "req_synth_filter_1") return reject(new Error("requestId 2nd arg missing or wrong: " + received.requestId));
      resolve({ _render: "payload", direction: "received", method: "onFiltersUpdated (synthetic)", payload: received });
    }),
  },
  {
    name: "requestFiltersUpdate emits echoRequestId on wire",
    category: "echo",
    description: "Capture postMessage and assert echoRequestId is set distinct from requestId",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestFiltersUpdate !== "function") return reject(new Error("Not available in this version"));
      var originalPost = window.parent.postMessage;
      var captured = null;
      window.parent.postMessage = function(msg, origin) {
        try {
          var parsed = typeof msg === "string" ? JSON.parse(msg) : msg;
          if (parsed && parsed.event === "filter" && !captured) captured = parsed;
        } catch (e) {}
        return originalPost.call(window.parent, msg, origin);
      };
      var filters = [{ column: "x", operator: "IN", values: ["y"], dataType: "STRING" }];
      try {
        domo.requestFiltersUpdate(filters, null, undefined, undefined, { echoRequestId: "req_filter_out_1" });
      } finally {
        window.parent.postMessage = originalPost;
      }
      if (!captured) return reject(new Error("No filter postMessage captured"));
      if (captured.echoRequestId !== "req_filter_out_1") return reject(new Error("echoRequestId missing or wrong: " + captured.echoRequestId));
      if (!captured.requestId) return reject(new Error("SDK ACK requestId missing"));
      if (captured.requestId === captured.echoRequestId) return reject(new Error("requestId and echoRequestId must be distinct"));
      resolve({ _render: "payload", direction: "sent", method: "requestFiltersUpdate", payload: captured });
    }),
  },
```

- [ ] **Step 3: Rebuild demo and smoke test**

```bash
npm run build:demo
```

Open `demo/public-assets/index.html` in a browser (or in a real Domo iframe). Switch to Test Suite, locate the new "Host Echo" category, click "Run Category". All 6 tests should pass.

Two tests require `domo.channel` to be present (synthetic dispatch via port1.onmessage). If you're opening the demo file directly without an iframe context, those tests will reject with "MessageChannel not connected" — that's expected when not running inside Domo.

- [ ] **Step 4: Commit**

```bash
git add demo/assets/js/config.js demo/assets/js/test-suite.js
git commit -m "$(cat <<'EOF'
Add Host Echo Correlation test category to demo (DOMO-483472)

Six tests cover inbound requestId surfacing on onAppDataUpdated and
onFiltersUpdated (via synthetic channel dispatch), outbound
echoRequestId emission on request*Update, and DomoValidationError
on invalid echoRequestId.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Documentation updates

**Files:**
- Modify: `CLAUDE.md` (New APIs table, Gotchas)
- Modify: `src/models/CLAUDE.md` (services/appdata.ts, services/filters.ts notes)
- Modify: `demo/CLAUDE.md` (Test Suite section)

- [ ] **Step 1: Update `CLAUDE.md`**

In `CLAUDE.md`, find the "New APIs (v6.0+)" table and add two rows at the bottom:

```markdown
| `requestAppDataUpdate(payload, onAck, onReply, { echoRequestId })` | Optional 4th opts bag — echoes a host correlation id (DOMO-483472) back on the wire |
| `requestFiltersUpdate(filters, pageStateUpdate, onAck, onReply, { echoRequestId })` | Optional 5th opts bag — echoes a host correlation id (DOMO-483472) back on the wire |
```

In the "Gotchas" section, add a bullet:

```markdown
- Host echo correlation (DOMO-483472): inbound `onAppDataUpdated` / `onFiltersUpdated` callbacks receive an optional 2nd `requestId?: string` arg holding the host's correlation id. Outbound `requestAppDataUpdate` / `requestFiltersUpdate` accept `{ echoRequestId }` in their opts bag; the SDK emits it as a wire field distinct from its own ACK-tracking `requestId`. Validated against `^[A-Za-z0-9_\-:.]{1,128}$` (mirrors DomoWeb's `sanitizeRequestId`).
```

- [ ] **Step 2: Update `src/models/CLAUDE.md`**

In the `appdata.ts` section, replace the existing `requestAppDataUpdate` bullet with:

```markdown
- **`requestAppDataUpdate(appData, onAck?, onReply?, opts?)`** — Wire: `{ event: "appData", appData, requestId, echoRequestId? }`. Desktop only (no mobile bridge). When `opts.echoRequestId` is set it is validated against the `[A-Za-z0-9_\-:.]{1,128}` whitelist and emitted as a separate wire field (DOMO-483472).
- **`onAppDataUpdated(callback)`** — Calls `connect(true)`. Callback signature `(appData: string, requestId?: string) => void`; 2nd arg is the host's echo correlation id when present (DOMO-483472). Returns unsubscribe function.
- **`handleAppData(message, responsePort?)`** — ACK + callbacks + handleReply. Forwards `message.requestId` to each listener as the 2nd arg.
```

In the `filters.ts` section, replace the existing `requestFiltersUpdate` and `onFiltersUpdated` bullets with:

```markdown
- **`requestFiltersUpdate(filters, pageStateUpdate?, onAck?, onReply?, opts?)`** — Validates via `guardAgainstInvalidFilters`, generates requestId, stores in `this.requests`. Desktop wire format: `{ event: "filter", filter: [{ columnName, operator, values, dataType }], pageStateUpdate, requestId, echoRequestId? }`. Mobile wire format: `[{ column, operand, values, dataType }]`. `opts.echoRequestId` is validated and emitted as a separate wire field (DOMO-483472). Passing `null` for filters **clears all filters** on the parent page.
- **`onFiltersUpdated(callback)`** — First listener triggers `connect()` (no skipFilters). Callback signature `(filters: Filter[], requestId?: string) => void`; 2nd arg is the host's echo correlation id when present (DOMO-483472). See `DOMO-483920` note above re: SUBSCRIBE replay. Returns unsubscribe function.
```

- [ ] **Step 3: Update `demo/CLAUDE.md`**

In the "Test Suite" section bullet list, add a new bullet (after the existing list of categories):

```markdown
- **Host Echo Correlation (DOMO-483472)** — synthetic-dispatch tests for `onAppDataUpdated`/`onFiltersUpdated` requestId surfacing, plus wire-emission and validation checks for `echoRequestId` on `requestAppDataUpdate`/`requestFiltersUpdate`
```

- [ ] **Step 4: Verify all referenced files are consistent**

```bash
grep -n 'echoRequestId' CLAUDE.md src/models/CLAUDE.md demo/CLAUDE.md
```

Expected: at least one hit in each file.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md src/models/CLAUDE.md demo/CLAUDE.md
git commit -m "$(cat <<'EOF'
Document echoRequestId / host echo correlation (DOMO-483472)

Updates CLAUDE.md New APIs + Gotchas, src/models/CLAUDE.md service
descriptions, and demo/CLAUDE.md Test Suite category list.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full type check + full test suite**

```bash
npx tsc --noEmit --skipLibCheck && npm test
```

Expected: type check clean; all Jest suites pass (existing 235 + the new ones from Tasks 1-5).

- [ ] **Step 2: Production build sanity**

```bash
npm run build && npm run build:demo
```

Expected: both builds complete without errors.

- [ ] **Step 3: Verify echoRequestId appears in built artifact**

```bash
grep -c 'echoRequestId' dist/domo.js demo/public-assets/domo.js
```

Expected: both files have at least 3 hits.

- [ ] **Step 4: Summary report**

Confirm the following are all in place:
- `src/utils/general.ts` exports `isValidEchoRequestId`
- `src/models/services/appdata.ts` accepts `AppDataUpdateOptions`
- `src/models/services/filters.ts` accepts `FiltersUpdateOptions`
- `src/domo.ts` `DomoListeners` types include optional 2nd arg
- `demo/assets/js/event-monitor.js` renders host-echo chips
- `demo/assets/js/test-suite.js` has the `echo` category with 6 tests
- `demo/assets/js/config.js` `CATEGORY_META.echo` entry
- All three CLAUDE.md files reference echoRequestId

No commit on this task — verification only.
