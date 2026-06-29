# Route Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic SPA route change detection to the domo.js SDK so `ROUTE_CHANGE` postMessages fire on pushState, replaceState, popstate, and hashchange — debounced at 100ms, zero developer effort.

**Architecture:** New `src/models/services/routing.ts` exports `initRouteCapture(): () => void` which patches history, registers event listeners, and owns the debounce state in a closure. `src/init.ts` imports and calls it once at module load alongside the existing MutationObserver setup.

**Tech Stack:** TypeScript, Jest + jsdom (fake timers for debounce), `window.parent.postMessage`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/models/services/routing.ts` | Create | History patching, event listeners, 100ms debounce, `ROUTE_CHANGE` postMessage |
| `src/models/services/routing.test.ts` | Create | 8 unit tests covering all triggers, debounce, route format, and cleanup |
| `src/init.ts` | Modify | Add `import { initRouteCapture }` and `initRouteCapture()` call after MutationObserver |

---

## Task 1: Write Failing Tests

**Files:**
- Create: `src/models/services/routing.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// src/models/services/routing.test.ts
import { initRouteCapture } from './routing';

describe('initRouteCapture', () => {
  let stop: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    window.parent.postMessage = jest.fn();
    stop = initRouteCapture();
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('sends ROUTE_CHANGE after pushState', () => {
    history.pushState({}, '', '/new-path');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ROUTE_CHANGE', route: '/new-path' }),
      '*'
    );
  });

  it('sends ROUTE_CHANGE after replaceState', () => {
    history.replaceState({}, '', '/replaced');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ROUTE_CHANGE', route: '/replaced' }),
      '*'
    );
  });

  it('sends ROUTE_CHANGE on popstate', () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('sends ROUTE_CHANGE on hashchange', () => {
    window.dispatchEvent(new Event('hashchange'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('debounces rapid pushState calls into a single message', () => {
    history.pushState({}, '', '/path1');
    history.pushState({}, '', '/path2');
    history.pushState({}, '', '/path3');
    expect(window.parent.postMessage).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('sends separate messages for calls more than 100ms apart', () => {
    history.pushState({}, '', '/first');
    jest.advanceTimersByTime(100);
    history.pushState({}, '', '/second');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledTimes(2);
  });

  it('includes pathname, search, and hash in route', () => {
    history.pushState({}, '', '/page?q=test#section');
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ROUTE_CHANGE', route: '/page?q=test#section' }),
      '*'
    );
  });

  it('stop() prevents further ROUTE_CHANGE messages', () => {
    stop();
    (window.parent.postMessage as jest.Mock).mockClear();
    history.pushState({}, '', '/after-stop');
    window.dispatchEvent(new PopStateEvent('popstate'));
    jest.advanceTimersByTime(100);
    expect(window.parent.postMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail with module-not-found**

```bash
npm test -- --testPathPattern="routing.test" --silent=false 2>&1 | tail -20
```

Expected: `Cannot find module './routing'` — all 8 tests error.

---

## Task 2: Implement `routing.ts`

**Files:**
- Create: `src/models/services/routing.ts`

- [ ] **Step 1: Create the implementation file**

```typescript
// src/models/services/routing.ts
import { domoDebug } from "../../utils/debug";

const DEBOUNCE_MS = 100;

export function initRouteCapture(): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function sendRouteChange(): void {
    const route = window.location.pathname + window.location.search + window.location.hash;
    const payload = { type: 'ROUTE_CHANGE', route };
    domoDebug.log('messages', 'sent:postMessage', 'ROUTE_CHANGE', payload);
    window.parent.postMessage(JSON.stringify(payload), '*');
  }

  function scheduleRouteChange(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendRouteChange, DEBOUNCE_MS);
  }

  const originalPushState = history.pushState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState.apply(history, args);
    scheduleRouteChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState.apply(history, args);
    scheduleRouteChange();
  };

  window.addEventListener('popstate', scheduleRouteChange);
  window.addEventListener('hashchange', scheduleRouteChange);

  return function stop(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', scheduleRouteChange);
    window.removeEventListener('hashchange', scheduleRouteChange);
  };
}
```

- [ ] **Step 2: Run routing tests to verify all 8 pass**

```bash
npm test -- --testPathPattern="routing.test" --silent=false 2>&1 | tail -20
```

Expected:
```
PASS src/models/services/routing.test.ts
  initRouteCapture
    ✓ sends ROUTE_CHANGE after pushState
    ✓ sends ROUTE_CHANGE after replaceState
    ✓ sends ROUTE_CHANGE on popstate
    ✓ sends ROUTE_CHANGE on hashchange
    ✓ debounces rapid pushState calls into a single message
    ✓ sends separate messages for calls more than 100ms apart
    ✓ includes pathname, search, and hash in route
    ✓ stop() prevents further ROUTE_CHANGE messages

Tests: 8 passed, 8 total
```

- [ ] **Step 3: Commit**

```bash
git add src/models/services/routing.ts src/models/services/routing.test.ts
git commit -m "feat: add initRouteCapture for ROUTE_CHANGE postMessages (DOMO-488031)"
```

---

## Task 3: Wire into `init.ts`

**Files:**
- Modify: `src/init.ts`

- [ ] **Step 1: Add import and call to `src/init.ts`**

Current file:
```typescript
import { handleNode } from "./utils/domoutils";
import { getToken } from "./models/constants/general";
```

New file (full contents):
```typescript
import { handleNode } from "./utils/domoutils";
import { getToken } from "./models/constants/general";
import { initRouteCapture } from "./models/services/routing";

export const __mutationObserverCallback = (mutations: any[]) => {
  const token = getToken();
  if (!token) return;

  for (const record of mutations) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLElement) handleNode(node, token);
    }
  }
};

const ob = new MutationObserver(__mutationObserverCallback);
ob.observe(document.documentElement, { childList: true, subtree: true });

initRouteCapture();
```

- [ ] **Step 2: Run the full test suite to verify nothing regressed**

```bash
npm test 2>&1 | tail -15
```

Expected:
```
Test Suites: 21 passed, 21 total
Tests:       269 passed, 269 total
Snapshots:   0 total
```

(21 suites = previous 20 + new routing.test.ts; 269 = previous 261 + 8 new)

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit --skipLibCheck 2>&1
```

Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add src/init.ts
git commit -m "feat: wire initRouteCapture into init.ts (DOMO-488031)"
```
