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
import { setContentHeaders, setAuthTokenHeader, setResponseType, handleNode, processBody } from './utils/domoutils';

class domo {
  private static _onDataUpdateListener: ((event: MessageEvent) => void) | null = null;
  static listeners: { [index: string]: Function[] } = {
    onDataUpdate: [],
    onFiltersUpdate: [],
    onAppData: [],
    onVariablesUpdated: [],
  };

  private static _sharedOnDataUpdateListener(event: MessageEvent) {
    if (!isVerifiedOrigin(event.origin)) return;
    if (typeof event.data === "string" && event.data.length > 0) {
      try {
        const message = JSON.parse(event.data);
        if (!message.hasOwnProperty("alias")) {
          return;
        }
        const alias = message.alias;
        const ack = JSON.stringify({ event: "ack", alias });
        if (event.source && typeof event.source.postMessage === 'function') {
          (event.source as any).postMessage(ack, event.origin);
        }
        domo.listeners.onDataUpdate.forEach(cb => cb(alias));
      } catch (err) {
        const info =
          "There was an error in onDataUpdate! It may be that our event listener caught " +
          "a message from another source and tried to parse it, so your update still may have worked. " +
          "If you would like more info, here is the error: \n";
        if (process?.env?.NODE_ENV !== 'test')
          console.warn(info, err);
      }
    }
  }

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
   * Multiple callbacks can be registered.
   */
  static onDataUpdate(cb: (alias: string) => void) {
    if (typeof cb !== 'function') return () => {};
    if (!domo._onDataUpdateListener) {
      domo._onDataUpdateListener = domo._sharedOnDataUpdateListener;
      window.addEventListener("message", domo._onDataUpdateListener);
    }
    domo.listeners.onDataUpdate.push(cb);
    return () => {
      const arr = domo.listeners.onDataUpdate;
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
      if (arr.length === 0 && domo._onDataUpdateListener) {
        window.removeEventListener("message", domo._onDataUpdateListener);
        domo._onDataUpdateListener = null;
      }
    };
  }

  /**
   * Let the domoapp optionally handle other events
   */
  static channel?: MessageChannel;
  static connected = false;

  // skipFilters indicates that we should not immediately fetch the filters from the page
  // if using connect() to subscribe to non-filter events, fetching filters immediately would cause a reload
  static connect = (skipFilters = false) => {
    if (domo.connected) return;
    domo.connected = true;
    domo.channel = new MessageChannel();
    window.parent.postMessage(
      JSON.stringify({ event: "subscribe", skipFilters }),
      "*",
      [domo.channel.port2]
    );
    domo.channel.port1.onmessage = (e: MessageEvent) => {
      const [responsePort] = e.ports;
      if (responsePort === undefined) return;

      if (
        e.data.event === "filtersUpdated" &&
        domo.listeners.onFiltersUpdate.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        domo.listeners.onFiltersUpdate.forEach((cb) => cb(e.data.filters)); // <- split out onFiltersUpdate so that you can handle each message differently here
      } else if (
        e.data.event === "appData" &&
        domo.listeners.onAppData.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        domo.listeners.onAppData.forEach((cb) => cb(e.data.appData));
      } else if (
        e.data.event === "variablesUpdated" &&
        domo.listeners.onVariablesUpdated.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        domo.listeners.onVariablesUpdated.forEach((cb) => cb(e.data.variables));
      }
    };
  };

  /**
   * Let the domoapp handle its own filter updates
   */
  static onFiltersUpdate = (callback: Function) => {
    domo.connect();
    domo.listeners.onFiltersUpdate.push(callback);

    // unregister
    return () => {
      const index = domo.listeners.onFiltersUpdate.indexOf(callback);
      domo.listeners.onFiltersUpdate.splice(index, 1);
    };
  };

  /**
   * Receive arbitrary messages to an embedded domoapp
   */
  static onAppData = (callback: Function) => {
    domo.connect(true);
    domo.listeners.onAppData.push(callback);

    // unregister
    return () => {
      const index = domo.listeners.onAppData.indexOf(callback);
      domo.listeners.onAppData.splice(index, 1);
    };
  };

  /**
   * Allow domoapp to handle variable updates in embed
   */
  static onVariablesUpdated = (callback: Function) => {
    domo.connect(true);
    domo.listeners.onVariablesUpdated.push(callback);

    // unregister
    return () => {
      const index = domo.listeners.onVariablesUpdated.indexOf(callback);
      domo.listeners.onVariablesUpdated.splice(index, 1);
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

  static filterContainer(filters: Filter[] | null, pageStateUpdate: boolean | null = null): void {
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
      pageStateUpdate
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

  // Send arbitrary data up to an embedding site
  static sendAppData(appData: string) {
    const message = JSON.stringify({
      event: "appData",
      appData,
    });
    window.parent.postMessage(message, "*");
  }

  static sendVariables(variables: string) {
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
    setAuthTokenHeader(req, token);
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
          data = JSON.parse(responseStr);
        } catch (ex) {
          reject(Error("Invalid JSON response"));
          return;
        }
        resolve(data);
      } else {
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

const HOST_WHITELIST = /^(?:[\w-]+\.)*(domo|domotech|domorig)\.(com|io)$/i;
const HOST_BLACKLIST = /domoapps/i;
function isVerifiedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname;
    return HOST_WHITELIST.test(host) && !HOST_BLACKLIST.test(host);
  } catch {
    return false;
  }
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

const __mutationObserverCallback = (mutations: any) => {
  const token = (window as any).__RYUU_SID__;
  for (const record of mutations) {
    record.addedNodes.forEach((node: any) => {
      if (node instanceof HTMLElement) handleNode(node, token);
    });
  }
};

const ob = new MutationObserver(__mutationObserverCallback);
ob.observe(document.documentElement, { childList: true });
ob.observe(document.head, { childList: true });

export default domo;
export { domo, __mutationObserverCallback };
