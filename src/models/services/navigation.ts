/**
 * Sends a navigation event message to the parent window to navigate to a specified URL.
 *
 * @param {string} url - The URL to navigate to.
 * @param {boolean} isNewWindow - Whether to open the URL in a new window.
 */
export function navigate(url: string, isNewWindow: boolean) {
  const message = JSON.stringify({
    event: "navigate",
    url: url,
    isNewWindow: isNewWindow,
  });
  window.parent.postMessage(message, "*");
}
