export function sendAppData(appData: string) {
  const message = JSON.stringify({
    event: "appData",
    appData,
  });

  window.parent.postMessage(message, "*");
}
