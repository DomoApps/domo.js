import { handleNode } from './utils/domoutils';
import { sharedOnDataUpdateListener, onDataUpdate } from "./models/services/dataset";
import { filterContainer } from "./models/services/filters";
import { sendVariables } from "./models/services/variables";
import { sendAppData } from "./models/services/appdata";
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

  private static _onDataUpdateListener: ((event: MessageEvent) => void) | null = null;
  private static _sharedOnDataUpdateListener(event: MessageEvent) {
    return sharedOnDataUpdateListener(Domo.listeners.onDataUpdate, isVerifiedOrigin)(event);
  }


  ///////////////////////////////////////////
  // General
  /////////////////////////////////////////

  // if using connect() to subscribe to non-filter events, fetching filters immediately would cause a reload
  static connect = (skipFilters = false) => {
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
   * Let the domoapp handle its own filter updates
   */
  static onFiltersUpdate = (callback: Function) => {
    Domo.connect();
    Domo.listeners.onFiltersUpdate.push(callback);

    // unregister
    return () => {
      const index = Domo.listeners.onFiltersUpdate.indexOf(callback);
      Domo.listeners.onFiltersUpdate.splice(index, 1);
    };
  };

  /**
   * Receive arbitrary messages to an embedded domoapp
   */
  static onAppData = (callback: Function) => {
    Domo.connect(true);
    Domo.listeners.onAppData.push(callback);

    // unregister
    return () => {
      const index = Domo.listeners.onAppData.indexOf(callback);
      Domo.listeners.onAppData.splice(index, 1);
    };
  };

  /**
   * Allow domoapp to handle variable updates in embed
   */
  static onVariablesUpdated = (callback: Function) => {
    Domo.connect(true);
    Domo.listeners.onVariablesUpdated.push(callback);

    // unregister
    return () => {
      const index = Domo.listeners.onVariablesUpdated.indexOf(callback);
      Domo.listeners.onVariablesUpdated.splice(index, 1);
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
