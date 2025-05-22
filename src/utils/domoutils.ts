export function setContentHeaders(req: XMLHttpRequest, options?: any) {
  if (options?.contentType) {
    if (options.contentType !== "multipart") {
      req.setRequestHeader("Content-Type", options.contentType);
    }
  } else {
    req.setRequestHeader("Content-Type", 'application/json');
  }
}

export function setAuthTokenHeader(req: XMLHttpRequest, token: string) {
  if (token) {
    req.setRequestHeader("X-DOMO-Ryuu-Session", token);
  }
}

export function setResponseType(req: XMLHttpRequest, options?: any) {
  if (options && options.responseType !== undefined) {
    req.responseType = options.responseType;
  }
}

export function handleNode(node: HTMLElement, token: string) {
  if (node === document.body || node === document.head)
    return processBody(node, token);

  const hrefAttribute =
    (node.dataset?.domoHref) || node.getAttribute("href");
  const srcAttribute =
    (node.dataset?.domoSrc) || node.getAttribute("src");
  const attr = hrefAttribute ? "href" : "src";
  const url = hrefAttribute || srcAttribute;

  if (!url || !token || url.includes(token)) return;
  const newUrl = new URL(url, document.location.origin);
  const isRelativeUrl = newUrl.origin === document.location.origin;
  if (isRelativeUrl) {
    newUrl.searchParams.append("ryuu_sid", token);
    node.setAttribute(attr, newUrl.href);
  }
}

export function processBody(node: Element, token: string) {
  for (const child of Array.from(node.children))
    handleNode(child as HTMLElement, token);
}