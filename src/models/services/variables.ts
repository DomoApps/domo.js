export function sendVariables(variables: string) {
  const userAgent = window.navigator.userAgent.toLowerCase(),
    safari = /safari/.test(userAgent),
    ios = /iphone|ipod|ipad/.test(userAgent);
  const message = JSON.stringify({
    event: "variables",
    variables,
  });

  if (ios && !safari) {
    (window as any).webkit.messageHandlers.domovariable.postMessage(variables);
  } else {
    window.parent.postMessage(message, "*");
  }
}