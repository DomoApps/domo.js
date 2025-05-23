import { handleNode } from './utils/domoutils';
import { sharedOnDataUpdateListener, onDataUpdate } from "./models/services/dataset";
import { filterContainer, onFiltersUpdate } from "./models/services/filters";
import { onVariablesUpdated, sendVariables } from "./models/services/variables";
import { onAppData, sendAppData } from "./models/services/appdata";
import { navigate } from "./models/services/navigation";
import { get, post, put, delete as del, domoHttp } from "./models/services/http";
import { isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders } from './utils/general';
import { getToken } from './models/constants/general';
import { ArrayRequestOptions, ObjectRequestOptions, RequestOptions } from './models/interfaces/request-options';
import { ArrayResponseBody, ObjectResponseBody, ResponseBody } from './models/interfaces/response-body';

class Domo {
  static channel?: MessageChannel;
  static connected = false;
  static listeners: { [index: string]: Function[] } = {
    onDataUpdate: [],
    onFiltersUpdate: [],
    onAppData: [],
    onVariablesUpdated: [],
  };

  ////////////////////////////////////
  // DOMO API
  //////////////////////////////////
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


  ////////////////////////////////////////////
  // Event Listeners
  //////////////////////////////////////////
  static readonly onDataUpdate = onDataUpdate;
  static readonly onFiltersUpdate = onFiltersUpdate
  static readonly onAppData = onAppData;
  static readonly onVariablesUpdated = onVariablesUpdated

  private static _onDataUpdateListener: ((event: MessageEvent) => void) | null = null;
  private static _sharedOnDataUpdateListener(event: MessageEvent) {
    return sharedOnDataUpdateListener(Domo.listeners.onDataUpdate, isVerifiedOrigin)(event);
  }


  ///////////////////////////////////////////
  // General
  /////////////////////////////////////////

  // if using connect() to subscribe to non-filter events, fetching filters immediately would cause a reload
  static readonly connect = (skipFilters = false) => {
    if (Domo.connected) return;
    Domo.connected = true;
    Domo.channel = new MessageChannel();
    window.parent.postMessage(
      JSON.stringify({ event: "subscribe", skipFilters }),
      "*",
      [Domo.channel.port2]
    );
    Domo.channel.port1.onmessage = (e: MessageEvent) => {
      const [responsePort] = e.ports;
      if (responsePort === undefined) return;

      if (
        e.data.event === "filtersUpdated" &&
        Domo.listeners.onFiltersUpdate.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        Domo.listeners.onFiltersUpdate.forEach((cb) => cb(e.data.filters)); // <- split out onFiltersUpdate so that you can handle each message differently here
      } else if (
        e.data.event === "appData" &&
        Domo.listeners.onAppData.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        Domo.listeners.onAppData.forEach((cb) => cb(e.data.appData));
      } else if (
        e.data.event === "variablesUpdated" &&
        Domo.listeners.onVariablesUpdated.length > 0
      ) {
        responsePort.postMessage({}); // Prevents the app from reloading. Says we've handled it
        Domo.listeners.onVariablesUpdated.forEach((cb) => cb(e.data.variables));
      }
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

export default Domo;
export { __mutationObserverCallback };
