import { handleNode } from './utils/domoutils';
import { onDataUpdated } from "./models/services/dataset";
import { filterContainer, onFiltersUpdated } from "./models/services/filters";
import { onVariablesUpdated, sendVariables } from "./models/services/variables";
import { onAppDataUpdated, sendAppData } from "./models/services/appdata";
import { navigate } from "./models/services/navigation";
import { get, post, put, delete as del, domoHttp } from "./models/services/http";
import { isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders } from './utils/general';
import { eventToListenerMap, getToken } from './models/constants/general';
import { ArrayRequestOptions, ObjectRequestOptions, RequestOptions } from './models/interfaces/request-options';
import { ArrayResponseBody, ObjectResponseBody, ResponseBody } from './models/interfaces/response-body';

/**
 * The Domo class provides a unified API for interacting with Domo platform features in client applications.
 *
 * It exposes HTTP methods, event listeners, emitters, and utility functions for working with datasets, filters, variables, app data, and navigation.
 *
 * Key features:
 * - HTTP request methods (get, post, put, delete, domoHttp)
 * - Batch request support via getAll
 * - Event listeners for data, filters, variables, and app data updates
 * - Emitters for sending variables, app data, and navigation events
 * - Utility functions for environment, origin verification, and query parsing
 * - Handles cross-frame communication and DOM mutation observation for token injection
 */
class Domo {
  public static channel?: MessageChannel;
  public static connected = false;
  public static listeners: { [index: string]: Function[] } = {
    onDataUpdated: [],
    onFiltersUpdated: [],
    onAppDataUpdated: [],
    onVariablesUpdated: [],
  };
  
  private static _onDataUpdateListener: ((event: MessageEvent) => void) | null = null;


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
  static readonly onDataUpdated = onDataUpdated;
  static readonly onFiltersUpdated = onFiltersUpdated;
  static readonly onAppDataUpdated = onAppDataUpdated;
  static readonly onVariablesUpdated = onVariablesUpdated;

  /* @deprecated */
  static readonly onFiltersUpdate = onFiltersUpdated;
  /* @deprecated */
  static readonly onDataUpdate = onDataUpdated;
  /* @deprecated */
  static readonly onAppData = onAppDataUpdated;


  /////////////////////////////////////////////
  // Emitters
  ///////////////////////////////////////////
  static readonly filterContainer = filterContainer;
  static readonly sendVariables = sendVariables;
  static readonly sendAppData = sendAppData;
  static readonly navigate = navigate;


  ///////////////////////////////////////////
  // General
  /////////////////////////////////////////
  static readonly env = getQueryParams();
  static readonly __util = {
    isVerifiedOrigin,
    getQueryParams,
    setFormatHeaders,
    isSuccess,
  };

  /**
   * Connects to the parent window's Domo instance using a MessageChannel.
   * This method sets up message handlers for various events like filtersUpdated, appData, and variablesUpdated.
   * It also sends a subscription message to the parent window.
   *
   * @param skipFilters - If true, skips the initial filter updates.
   */
  static readonly connect = (skipFilters = false) => {
    if (this.connected) return;
    this.connected = true;
    this.channel = new MessageChannel();
    window.parent.postMessage(
      JSON.stringify({ event: "subscribe", skipFilters }),
      window.parent.origin, // Originally "*" possibly for embed?
      [this.channel.port2]
    );

    const eventHandlers: { [event: string]: (data: any, responsePort: MessagePort) => void } = {
      filtersUpdated: (data, responsePort) => {
        responsePort.postMessage({});
        this.listeners.onFiltersUpdated.forEach(cb => cb(data.filters));
      },
      appData: (data, responsePort) => {
        responsePort.postMessage({});
        this.listeners.onAppDataUpdated.forEach(cb => cb(data.appData));
      },
      variablesUpdated: (data, responsePort) => {
        responsePort.postMessage({});
        this.listeners.onVariablesUpdated.forEach(cb => cb(data.variables));
      }
    };

    this.channel.port1.onmessage = (e: MessageEvent) => {
      const [responsePort] = e.ports;
      if (!responsePort) return;

      const listenerKey = eventToListenerMap[e.data.event];
      const handler = eventHandlers[e.data.event];
      if (handler && listenerKey && this.listeners[listenerKey]?.length > 0) {
        handler(e.data, responsePort);
      }
    };
  };

  /**
   * Allows consumers to override or extend static methods/properties of the Domo class.
   * 
   * Example Usage:
   * import Domo, { get as originalGet } from 'domo.js';
   * 
   * Domo.extend({
   *  get: (url, options) => {
   *    // custom logic
   *    return originalGet(url, options);
   *  }
   * });
   * 
   * @param overrides An object whose keys are static method/property names and values are the new implementations.
   */
  static extend(overrides: Partial<Record<keyof typeof Domo, any>>) {
    for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(Domo, key))
        (Domo as any)[key as keyof typeof Domo] = overrides[key as keyof typeof Domo];
    }
  }
}

/**
 * MutationObserver callback that injects the authentication token into any newly added HTML elements.
 *
 * This function is triggered whenever nodes are added to the DOM (either in the document or head).
 * It retrieves the current token and applies it to any new HTMLElement using the handleNode utility.
 *
 * @param mutations - An array of MutationRecord objects representing the changes to the DOM.
 */
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
