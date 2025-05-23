import { handleNode } from './utils/domoutils';
import { sharedOnDataUpdateListener } from "./models/services/dataset";
import { filterContainer } from "./models/services/filters";
import { sendVariables } from "./models/services/variables";
import { sendAppData } from "./models/services/appdata";
import { navigate } from "./models/services/navigation";
import { get, post, put, delete as del, domoHttp } from "./models/services/http";
import { isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders } from './utils/general';
import { getToken } from './models/constants/general';
import { ArrayRequestOptions, ObjectRequestOptions, RequestOptions } from './models/interfaces/request-options';
import { ArrayResponseBody, ObjectResponseBody, ResponseBody } from './models/interfaces/response-body';

class domo {
  private static _onDataUpdateListener: ((event: MessageEvent) => void) | null = null;
  static listeners: { [index: string]: Function[] } = {
    onDataUpdate: [],
    onFiltersUpdate: [],
    onAppData: [],
    onVariablesUpdated: [],
  };

  private static _sharedOnDataUpdateListener(event: MessageEvent) {
    return sharedOnDataUpdateListener(domo.listeners.onDataUpdate, isVerifiedOrigin)(event);
  }

  static readonly get: typeof get = get;
  static readonly post: typeof post = post;
  static readonly put: typeof put = put;
  static readonly delete: typeof del = del;
  static readonly domoHttp: typeof domoHttp = domoHttp;
  
  static getAll(urls: string[], options: ObjectRequestOptions): Promise<ObjectResponseBody[][]>;
  static getAll(urls: string[], options: ArrayRequestOptions): Promise<ArrayResponseBody[]>;
  static getAll(urls: string[], options?: RequestOptions): Promise<ResponseBody[]>;
  static getAll<T>(urls: string[], options?: RequestOptions): Promise<T[]>;
  static getAll<T = ResponseBody>(urls: string[], options?: RequestOptions): Promise<T[]> {
      return Promise.all(urls.map(url => this.get<T>(url, options)));
  };

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
  static navigate = navigate;

  static filterContainer = filterContainer;

  // Send arbitrary data up to an embedding site
  static sendAppData = sendAppData;

  static sendVariables = sendVariables;

  static env = getQueryParams();

  static __util = {
    isVerifiedOrigin,
    getQueryParams,
    setFormatHeaders,
    isSuccess,
  };
}

const __mutationObserverCallback = (mutations: any) => {
  const token = getToken();
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
export { __mutationObserverCallback };
