import { domoDebug } from "../../utils/debug";

const DEBOUNCE_MS = 100;

export function initRouteCapture(): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function sendRouteChange(): void {
    const route = globalThis.location.pathname + globalThis.location.search + globalThis.location.hash;
    const payload = { event: 'routeChange', route };
    domoDebug.log('messages', 'sent:postMessage', 'routeChange', payload);
    globalThis.parent.postMessage(JSON.stringify(payload), '*');
  }

  function scheduleRouteChange(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendRouteChange, DEBOUNCE_MS);
  }

  const originalPushState = globalThis.history.pushState;
  globalThis.history.pushState = function (...args: Parameters<typeof globalThis.history.pushState>) {
    originalPushState.apply(globalThis.history, args);
    scheduleRouteChange();
  };

  const originalReplaceState = globalThis.history.replaceState;
  globalThis.history.replaceState = function (...args: Parameters<typeof globalThis.history.replaceState>) {
    originalReplaceState.apply(globalThis.history, args);
    scheduleRouteChange();
  };

  globalThis.addEventListener('popstate', scheduleRouteChange);
  globalThis.addEventListener('hashchange', scheduleRouteChange);

  return function stop(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    globalThis.history.pushState = originalPushState;
    globalThis.history.replaceState = originalReplaceState;
    globalThis.removeEventListener('popstate', scheduleRouteChange);
    globalThis.removeEventListener('hashchange', scheduleRouteChange);
  };
}
