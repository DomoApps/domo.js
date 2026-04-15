import { domoDebug } from "../../utils/debug";

/**
 * Sends a navigation event message to the parent window to navigate to a specified URL.
 *
 * @param {string} url - The URL to navigate to.
 * @param {boolean} isNewWindow - Whether to open the URL in a new window.
 */
export function navigate(url: string, isNewWindow: boolean) {
  const payload = {
    event: "navigate",
    url: url,
    isNewWindow: isNewWindow,
  };
  domoDebug.log('messages', 'sent:postMessage', 'navigate', payload);
  window.parent.postMessage(JSON.stringify(payload), "*");
}
