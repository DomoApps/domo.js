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

  const originalPushState = window.history.pushState;
  window.history.pushState = function (...args: Parameters<typeof window.history.pushState>) {
    originalPushState.apply(window.history, args);
    scheduleRouteChange();
  };

  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = function (...args: Parameters<typeof window.history.replaceState>) {
    originalReplaceState.apply(window.history, args);
    scheduleRouteChange();
  };

  window.addEventListener('popstate', scheduleRouteChange);
  window.addEventListener('hashchange', scheduleRouteChange);

  return function stop(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', scheduleRouteChange);
    window.removeEventListener('hashchange', scheduleRouteChange);
  };
}
