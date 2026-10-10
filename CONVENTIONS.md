# Code Conventions

## 1. Async/Await Only

Never use `.then()` for promise chaining — every sequential async call site uses `await`.

`.catch()` is acceptable for **fire-and-forget** calls in synchronous contexts where `await` is not available (e.g. inside `queueMicrotask` or a synchronous `useEffect`), and is preferred when it avoids an async IIFE.

```js
// wrong — .then() chaining instead of await
fetchData().then(data => process(data)).catch(handleError);

// correct — sequential async logic uses await
const data = await fetchData();

// correct — fire-and-forget in a sync context; .catch() is simpler than an async IIFE
void submitLaunchForm(true).catch(error => {
  pendingRelaunchRef.current = false;
  console.error('relaunch failed', error);
});
```

## 2. Immutable Transforms

Never mutate accumulators in `reduce`, push into arrays, or reassign object properties outside of Immer reducer bodies. Use spread and nullish coalescing instead.

```js
// wrong
const map = items.reduce((acc, item) => {
  if (!acc[item.key]) acc[item.key] = [];
  acc[item.key].push(item);
  return acc;
}, {});

// correct
const map = items.reduce((acc, item) => ({
  ...acc,
  [item.key]: [...(acc[item.key] ?? []), item],
}), {});
```

## 3. Logical Assignment Operators

Use `??=` to initialize a value if absent. Use `&&=` to conditionally update a value that already exists. Never write a guard-then-assign pattern.

```js
// wrong
if (!state.errors[id]) state.errors[id] = [];
if (state.errors[id]) state.errors[id] = state.errors[id].filter(k => k !== key);

// correct
state.errors[id] ??= [];
state.errors[id] &&= state.errors[id].filter(k => k !== key);
```

## 4. No Nested Conditionals

In JS, use flat sequential guards with early returns. In JSX, place all conditions at the same level — never wrap a group of `&&` expressions inside another `&&` block.

```jsx
// wrong — nested
{status === 'succeeded' && (
  <>
    {items.length === 0 && <p>Empty</p>}
    {items.length > 0 && <List items={items} />}
  </>
)}

// correct — flat
{(status === 'loading' || status === 'idle') && <div>Loading...</div>}
{status === 'failed' && <ErrorState error={error} onRetry={onRetry} />}
{status === 'succeeded' && items.length === 0 && <p>Empty</p>}
{status === 'succeeded' && items.length > 0 && <List items={items} />}
```

## 5. Component Composition

Extract named components for any JSX that has real structure (more than a single element). Use inline `&&` only for a single trivial element.

```jsx
// wrong — complex JSX inline
{status === 'failed' && (
  <div>
    <p>Error: {error}</p>
    <button onClick={onRetry}>Retry</button>
  </div>
)}

// correct — extracted
function ErrorState({ error, onRetry }) {
  return (
    <div>
      <p>Error: {error}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}

{status === 'failed' && <ErrorState error={error} onRetry={onRetry} />}
```

## 6. Test Fixture Immutability

Freeze top-level mock objects and their nested content with `Object.freeze` so accidental mutations throw immediately. Use `structuredClone` instead of spread (`{ ...obj }`) for independent deep copies.

```js
// wrong
const mockDoc = {
  id: 'doc-1',
  content: { userId: 'u1', progress: { ...EMPTY_PROGRESS } },
};

// correct
const mockDoc = Object.freeze({
  id: 'doc-1',
  content: Object.freeze({
    userId: 'u1',
    progress: structuredClone(EMPTY_PROGRESS),
  }),
});
```
