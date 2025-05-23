// Handles navigation logic

function navigate(url: string, isNewWindow: boolean) {
  const message = JSON.stringify({
    event: "navigate",
    url: url,
    isNewWindow: isNewWindow,
  });
  window.parent.postMessage(message, "*");
}

export { navigate };