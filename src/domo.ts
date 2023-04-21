import {
  RequestMethods,
  RequestOptions,
  ObjectRequestOptions,
  ArrayRequestOptions,
  DataFormats,
  QueryParams,
  Filter,
  RequestBody,
  ResponseBody,
  ObjectResponseBody,
  ArrayResponseBody,
} from "./models";
import { domoFormatToRequestFormat } from "./utils/data-helpers";

export = domo;

class domo {
  static post(
    url: string,
    body?: RequestBody,
    options?: RequestOptions
  ): Promise<ResponseBody>;
  static post<T>(
    url: string,
    body?: RequestBody,
    options?: RequestOptions
  ): Promise<T>;
  static post<T>(
    url: string,
    body?: RequestBody,
    options?: RequestOptions
  ): Promise<T> {
    return domoHttp<T>(RequestMethods.POST, url, options, true, body);
  }

  static put(
    url: string,
    body?: RequestBody,
    options?: RequestOptions
  ): Promise<ResponseBody>;
  static put<T>(
    url: string,
    body?: RequestBody,
    options?: RequestOptions
  ): Promise<T>;
  static put<T>(
    url: string,
    body?: RequestBody,
    options?: RequestOptions
  ): Promise<T> {
    return domoHttp<T>(RequestMethods.PUT, url, options, true, body);
  }

  static get(
    url: string,
    options: ObjectRequestOptions
  ): Promise<ObjectResponseBody[]>;
  static get(
    url: string,
    options: ArrayRequestOptions
  ): Promise<ArrayResponseBody>;
  static get(url: string, options?: RequestOptions): Promise<ResponseBody>;
  static get<T>(url: string, options?: RequestOptions): Promise<T>;
  static get<T>(url: string, options?: RequestOptions): Promise<T> {
    return domoHttp<T>(RequestMethods.GET, url, options);
  }

  static delete(url: string, options?: RequestOptions): Promise<ResponseBody>;
  static delete<T>(url: string, options?: RequestOptions): Promise<T>;
  static delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return domoHttp<T>(RequestMethods.DELETE, url, options);
  }

  static getAll(
    urls: string[],
    options: ObjectRequestOptions
  ): Promise<ObjectResponseBody[][]>;
  static getAll(
    urls: string[],
    options: ArrayRequestOptions
  ): Promise<ArrayResponseBody[]>;
  static getAll(
    urls: string[],
    options?: RequestOptions
  ): Promise<ResponseBody[]>;
  static getAll<T>(urls: string[], options?: RequestOptions): Promise<T[]>;
  static getAll<T>(urls: string[], options?: RequestOptions): Promise<T[]> {
    return Promise.all(
      urls.map(function (url) {
        return domo.get<T>(url, options);
      })
    );
  }

  /**
   * Let the domoapp optionally handle its own data updates.
   */
  static onDataUpdate(cb: (alias: string) => void) {
    function innerCallback(event: MessageEvent) {
      if (!isVerifiedOrigin(event.origin)) return;

      if (typeof event.data === "string" && event.data.length > 0) {
        try {
          const message = JSON.parse(event.data);
          if (!message.hasOwnProperty("alias")) {
            return;
          }

          const alias = message.alias;

          // send acknowledgement to prevent autorefresh
          const ack = JSON.stringify({
            event: "ack",
            alias: alias,
          });

          // Only WindowProxy | Window have the postMessage method and the type of event.source varies between browsers
          if (
            !(event.source instanceof MessagePort) &&
            !(event.source instanceof ServiceWorker)
          ) {
            event.source.postMessage(ack, event.origin);
          }

          // inform domo app which alias has been updated
          cb(alias);
        } catch (err) {
          const info =
            "There was an error in onDataUpdate! It may be that our event listener caught " +
            "a message from another source and tried to parse it, so your update still may have worked. " +
            "If you would like more info, here is the error: \n";
          console.warn(info, err);
        }
      }
    }
    window.addEventListener("message", innerCallback);
    return () => window.removeEventListener("message", innerCallback);
  }

  /**
   * Let the domoapp optionally handle other events
   */
  static channel?: MessageChannel;
  static connected = false;
  static listeners: { [index: string]: Function[] } = {
    onFiltersUpdate: [],
  };

  static connect = () => {
    if (domo.connected) return;
    domo.connected = true;
    domo.channel = new MessageChannel();
    window.parent.postMessage(JSON.stringify({ event: "subscribe" }), "*", [
      domo.channel.port2,
    ]);
  };

  /**
   * Let the domoapp handle its own filter updates
   */
  static onFiltersUpdate = (callback: Function) => {
    domo.connect();
    const index = domo.listeners.onFiltersUpdate.push(callback) - 1;

    domo.channel.port1.onmessage = (e: MessageEvent) => {
      const [responsePort] = e.ports;
      if (responsePort === undefined) return;

      if (
        e.data.event === "filtersUpdated" &&
        domo.listeners.onFiltersUpdate.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        domo.listeners.onFiltersUpdate.forEach((cb) => cb(e.data.filters)); // <- split out onFiltersUpdate so that you can handle each message differently here
      }
    };

    // unregister
    return () => {
      domo.listeners.onFiltersUpdate.splice(index, 1);
    };
  };

  /**
   * Request a navigation change
   */
  static navigate(url: string, isNewWindow: boolean) {
    const message = JSON.stringify({
      event: "navigate",
      url: url,
      isNewWindow: isNewWindow,
    });
    window.parent.postMessage(message, "*");
  }

  static filterContainer(filters: Filter[] | null): void {
    const userAgent = window.navigator.userAgent.toLowerCase(),
      safari = /safari/.test(userAgent),
      ios = /iphone|ipod|ipad/.test(userAgent);

    const message = JSON.stringify({
      event: "filter",
      filter:
        filters &&
        filters.map((filter) => ({
          columnName: filter.column,
          operator: filter.operator || (filter as any).operand, // Most filter code (including Phoenix) still uses "operand" instead of "operator"
          values: filter.values,
          dataType: filter.dataType,
        })),
    });

    if (ios && !safari) {
      (window as any).webkit.messageHandlers.domofilter.postMessage(
        filters &&
          filters.map((filter) => ({
            column: filter.column,
            operand: filter.operator || (filter as any).operand,
            values: filter.values,
            dataType: filter.dataType,
          }))
      );
    } else {
      window.parent.postMessage(message, "*");
    }
  }

  static env = getQueryParams();

  static __util = {
    isVerifiedOrigin,
    getQueryParams,
    setFormatHeaders,
    isSuccess,
  };
}

const token = (window as any).__RYUU_SID__;

function domoHttp(
  method: RequestMethods,
  url: string,
  options: ObjectRequestOptions,
  async?: boolean,
  body?: RequestBody
): Promise<ObjectResponseBody[]>;
function domoHttp(
  method: RequestMethods,
  url: string,
  options: ArrayRequestOptions,
  async?: boolean,
  body?: RequestBody
): Promise<ArrayResponseBody>;
function domoHttp(
  method: RequestMethods,
  url: string,
  options: RequestOptions,
  async?: boolean,
  body?: RequestBody
): Promise<ResponseBody>;
function domoHttp<T>(
  method: RequestMethods,
  url: string,
  options: RequestOptions,
  async?: boolean,
  body?: RequestBody
): Promise<T>;
function domoHttp(
  method: RequestMethods,
  url: string,
  options: RequestOptions,
  async?: boolean,
  body?: RequestBody
): Promise<ResponseBody> {
  options = options || {};
  return new Promise(function (
    resolve: (value?: ResponseBody) => void,
    reject: (reason?: Error) => void
  ) {
    // Do the usual XHR stuff
    let req: XMLHttpRequest = new XMLHttpRequest();
    if (async) {
      req.open(method, url, async);
    } else {
      req.open(method, url);
    }
    setFormatHeaders(req, url, options);
    setContentHeaders(req, options);
    setAuthTokenHeader(req);
    setResponseType(req, options);

    req.onload = function () {
      let data;
      // This is called even on 404 etc so check the status
      if (isSuccess(req.status)) {
        if (["csv", "excel"].includes(options.format) || !req.response) {
          resolve(req.response);
        }
        if (options.responseType === "blob") {
          resolve(
            new Blob([req.response], {
              type: req.getResponseHeader("content-type"),
            })
          );
        }

        let responseStr = req.response;
        try {
          // if(!responseStr) {
          //   responseStr = "{}";
          // }
          data = JSON.parse(responseStr);
        } catch (ex) {
          reject(Error("Invalid JSON response"));
          return;
        }
        // Resolve the promise with the response text
        resolve(data);
      } else {
        // Otherwise reject with the status text
        // which will hopefully be a meaningful error
        reject(Error(req.statusText));
      }
    };

    // Handle network errors
    req.onerror = function () {
      reject(Error("Network Error"));
    };

    // Make the request
    if (body) {
      if (!options.contentType || options.contentType === DataFormats.JSON) {
        const json = JSON.stringify(body);
        // Make the request
        req.send(json);
      } else {
        // body can no longer be JSON
        req.send(body as Document | XMLHttpRequestBodyInit);
      }
    } else {
      req.send();
    }
  });
}

function isSuccess(status: number) {
  return status >= 200 && status < 300;
}

function isVerifiedOrigin(origin: string) {
  const whitelisted = origin.match(
    "^https?://([^/]+[.])?(domo|domotech|domorig).(com|io)?(/.*)?$"
  );
  const blacklisted = origin.match("(.*).(domoapps).(.*)");
  return !!whitelisted && !blacklisted;
}

function getQueryParams(): QueryParams {
  const query = location.search.substr(1);
  let result: { [index: string]: string } = {};
  query.split("&").forEach(function (part) {
    const item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

function setFormatHeaders(
  req: XMLHttpRequest,
  url: string,
  options?: RequestOptions
) {
  if (url.indexOf("data/v") === -1) {
    return;
  }
  // set format
  const requestFormat: DataFormats =
    options.format !== undefined
      ? domoFormatToRequestFormat(options.format)
      : DataFormats.DEFAULT;

  req.setRequestHeader("Accept", requestFormat);
}

function setContentHeaders(req: XMLHttpRequest, options?: RequestOptions) {
  if (options.contentType) {
    // set content type if user passed option
    if (options.contentType !== "multipart") {
      req.setRequestHeader("Content-Type", options.contentType);
    }
  } else {
    req.setRequestHeader("Content-Type", DataFormats.JSON);
  }
}

function setAuthTokenHeader(req: XMLHttpRequest) {
  if (token) {
    req.setRequestHeader("X-DOMO-Ryuu-Session", token);
  }
}

function setResponseType(req: XMLHttpRequest, options?: RequestOptions) {
  //set response type if user passed option
  if (options.responseType !== undefined) {
    req.responseType = options.responseType;
  }
}

function handleNode(node: HTMLElement) {
  if (node === document.body || node === document.head)
    return processBody(node);

  const hrefAttribute =
    (node.dataset && node.dataset.domoHref) || node.getAttribute("href");
  const srcAttribute =
    (node.dataset && node.dataset.domoSrc) || node.getAttribute("src");
  const attr = hrefAttribute ? "href" : "src";
  const url = hrefAttribute || srcAttribute;

  if (!url || !token || url.includes(token)) return;

  const newUrl = new URL(url, document.location.origin);
  const isRelativeUrl = newUrl.origin === document.location.origin;
  if (isRelativeUrl) {
    newUrl.searchParams.append("ryuu-sid", token);
    node.setAttribute(attr, newUrl.href);
  }
}

function processBody(node: any) {
  for (let i = 0; i < node.children.length; i++) {
    handleNode(<HTMLElement>node.children[i]);
  }
}

const ob = new MutationObserver((mutations) => {
  for (const record of mutations) {
    processBody(record.target);
  }
});

ob.observe(document.body, { childList: true, subtree: true });
ob.observe(document.head, { childList: true, subtree: true });
