import { handleNode } from "./utils/domoutils";
import { getToken } from "./models/constants/general";

/**
 * MutationObserver callback that injects the authentication token into any newly added HTML elements.
 *
 * Uses a single observer on documentElement with subtree: true to catch all DOM additions,
 * including deeply nested elements added by frameworks. The token is fetched once per
 * microtask batch (not per-node) for efficiency.
 *
 * @param mutations - An array of MutationRecord objects representing the changes to the DOM.
 */
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
