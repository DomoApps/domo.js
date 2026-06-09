# Route Capture Design — DOMO-488031

## Summary

Add automatic SPA route change detection to the domo.js SDK. When a custom app navigates (pushState, replaceState, popstate, hashchange), the SDK posts a `ROUTE_CHANGE` message to the parent frame so DomoWeb can reflect the current route in the browser address bar (the parent-frame side is DOMO-488029).

The SDK always emits these messages. If DomoWeb's `custom-app-direct-linking` feature flag is off, the parent silently ignores them.

---

## Architecture

### New file: `src/models/services/routing.ts`

Exports a single function `initRouteCapture()`. All mutable state (debounce timer, original history references) is scoped inside the function closure — no module-level side effects. Returns a `stop()` teardown function that removes listeners and restores the original history methods.

```ts
export function initRouteCapture(): () => void {
  // patches history, registers listeners, owns debounce timer
  // returns stop() that undoes all patches and listeners
}
```

### `src/init.ts` change

One import and one call added at the bottom, after the existing MutationObserver setup:

```ts
import { initRouteCapture } from "./models/services/routing";
initRouteCapture();
```

`init.ts` is already the bootstrapping module (imported by `domo.ts`); adding route capture here is consistent with its role.

---

## Data Flow

On any navigation trigger:

1. Wrapped `history.pushState` / `history.replaceState` calls the original first, then schedules a route change.
2. `popstate` and `hashchange` listeners on `window` also schedule a route change.
3. Schedule = 100ms debounce: `clearTimeout` + `setTimeout`. Rapid consecutive triggers collapse into one message.
4. When the timer fires, build `route = window.location.pathname + window.location.search + window.location.hash` and post:

```ts
window.parent.postMessage(
  JSON.stringify({ type: 'ROUTE_CHANGE', route }),
  '*'
)
```

Logging follows the existing pattern:
```ts
domoDebug.log('messages', 'sent:postMessage', 'ROUTE_CHANGE', payload);
```

### Message contract

```ts
interface RouteChangeMessage {
  type: 'ROUTE_CHANGE';
  route: string; // e.g. '/dashboard/sales?region=west#section1'
}
```

---

## Error Handling

- No try/catch around `postMessage` — consistent with `navigation.ts`. If not in an iframe, `window.parent === window` and the message is harmless.
- Original `pushState`/`replaceState` are always called first; the patch never blocks navigation.
- No SSR guard needed — `init.ts` already assumes a browser environment.
- No initial-load emit — only subsequent navigation events trigger messages.

---

## Testing

File: `src/models/services/routing.test.ts`

Each test uses `let stop: () => void` with `beforeEach(() => { stop = initRouteCapture(); })` and `afterEach(() => stop())` to prevent stacking wrappers/listeners across tests. Uses `jest.useFakeTimers()` to control debounce and mocks `window.parent.postMessage`.

| # | Case | Expected |
|---|------|----------|
| 1 | `history.pushState(...)` called | `ROUTE_CHANGE` posted with correct route |
| 2 | `history.replaceState(...)` called | `ROUTE_CHANGE` posted with correct route |
| 3 | `popstate` event dispatched | `ROUTE_CHANGE` posted |
| 4 | `hashchange` event dispatched | `ROUTE_CHANGE` posted |
| 5 | 3 pushState calls within 100ms | Exactly 1 message (debounce collapses) |
| 6 | 2 calls >100ms apart | Exactly 2 messages |
| 7 | Route includes search + hash | `route` = `pathname + search + hash` |

---

## What Is Not Changing

- `navigation.ts` — unchanged; `Domo.navigate()` is unaffected
- `domo.ts` — no changes; route capture initializes via `init.ts`
- Message channel / subscription flow — untouched
- Mobile bridge — route capture uses `window.parent.postMessage` directly (no mobile bridge needed; the parent frame receives via standard postMessage)
