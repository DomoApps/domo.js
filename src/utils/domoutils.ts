/**
 * Sets the Content-Type header on the provided headers object based on options.
 *
 * - If options.contentType is 'multipart', the Content-Type header is not set.
 * - If options.contentType is provided (and not 'multipart'), it is used as the Content-Type.
 * - Otherwise, defaults to 'application/json'.
 *
 * @param headers - The headers object to modify.
 * @param options - Optional object that may contain a contentType property.
 */
export function setContentHeaders(headers: Record<string, string>, options?: any) {
  if (options?.contentType === "multipart") return;

  headers["Content-Type"] = 'application/json';
  if (options?.contentType)
    headers["Content-Type"] = options.contentType;
}

/**
 * Sets or removes the X-DOMO-Ryuu-Session authentication token header.
 *
 * @param headers - The headers object to modify.
 * @param token - The authentication token to set. If falsy, the header is removed.
 */
export function setAuthTokenHeader(headers: Record<string, string>, token: string) {
  if (token) 
    return headers["X-DOMO-Ryuu-Session"] = token;
  delete headers["X-DOMO-Ryuu-Session"];
}

/**
 * Sets the responseType property on an XMLHttpRequest if specified in options.
 *
 * @param req - The XMLHttpRequest object to modify.
 * @param options - Optional object that may contain a responseType property.
 */
export function setResponseType(req: XMLHttpRequest, options?: any) {
  if (options && options.responseType !== undefined)
    req.responseType = options.responseType;
}

/**
 * Handles a DOM node by updating its href or src attribute with a session token if applicable.
 *
 * @param node - The DOM node to process.
 * @param token - The session token to append to URLs.
 */
export function handleNode(node: HTMLElement, token: string) {
  if (node === document.body || node === document.head)
    return processBody(node, token);

  const hrefAttribute = (node.dataset?.domoHref) || node.getAttribute("href");
  const srcAttribute = (node.dataset?.domoSrc) || node.getAttribute("src");
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

/**
 * Recursively processes all child elements of a node, applying handleNode to each.
 *
 * @param node - The parent DOM element whose children will be processed.
 * @param token - The session token to append to URLs.
 */
export function processBody(node: Element, token: string) {
  for (const child of Array.from(node.children))
    handleNode(child as HTMLElement, token);
}