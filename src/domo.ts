import { handleNode } from "./utils/domoutils";
import { onDataUpdated } from "./models/services/dataset";
import { filterContainer, onFiltersUpdated } from "./models/services/filters";
import { onVariablesUpdated, sendVariables } from "./models/services/variables";
import { onAppDataUpdated, sendAppData } from "./models/services/appdata";
import { navigate } from "./models/services/navigation";
import {
  get,
  getAll,
  post,
  put,
  delete as del,
  domoHttp,
} from "./models/services/http";
import {
  isSuccess,
  isVerifiedOrigin,
  getQueryParams,
  setFormatHeaders,
} from "./utils/general";
import { eventToListenerMap, getToken } from "./models/constants/general";

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

  ////////////////////////////////////
  // DOMO API
  //////////////////////////////////
  static get: typeof get = get;
  static getAll: typeof getAll = getAll;
  static post: typeof post = post;
  static put: typeof put = put;
  static delete: typeof del = del;
  static domoHttp: typeof domoHttp = domoHttp;

  ////////////////////////////////////////////
  // Event Listeners
  //
  // These receive messages from the parent window via port1 of the MessageChannel
  //////////////////////////////////////////
  static onDataUpdated = onDataUpdated;
  static onFiltersUpdated = onFiltersUpdated;
  static onAppDataUpdated = onAppDataUpdated;
  static onVariablesUpdated = onVariablesUpdated;

  /* @deprecated */
  static readonly onFiltersUpdate = this.onFiltersUpdated;
  /* @deprecated */
  static readonly onDataUpdate = this.onDataUpdated;
  /* @deprecated */
  static readonly onAppData = this.onAppDataUpdated;

  /////////////////////////////////////////////
  // Emitters
  //
  // These send messages to the parent window via port2 of the MessageChannel
  ///////////////////////////////////////////
  static filterContainer = filterContainer;
  static sendVariables = sendVariables;
  static sendAppData = sendAppData;
  static navigate = navigate;

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
  static connect = (skipFilters = false) => {
    if (this.connected) return;
    this.connected = true;
    this.channel = new MessageChannel();
    window.parent.postMessage(
      JSON.stringify({ event: "subscribe", skipFilters }),
      "*",
      [this.channel.port2]
    );

    const eventHandlers: {
      [event: string]: (data: any, responsePort: MessagePort) => void;
    } = {
      dataUpdated: (message, responsePort) => {
        responsePort.postMessage({ event: "ack", alias: message.alias });
        this.listeners.onDataUpdated.forEach((cb) => cb(message.alias));
      },
      filtersUpdated: (message, responsePort) => {
        responsePort.postMessage({});
        this.listeners.onFiltersUpdated.forEach((cb) => cb(message.filters));
      },
      appData: (message, responsePort) => {
        responsePort.postMessage({});
        this.listeners.onAppDataUpdated.forEach((cb) => cb(message.appData));
      },
      variablesUpdated: (message, responsePort) => {
        responsePort.postMessage({});
        this.listeners.onVariablesUpdated.forEach((cb) =>
          cb(message.variables)
        );
      },
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
        (Domo as any)[key as keyof typeof Domo] =
          overrides[key as keyof typeof Domo];
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
export { Domo, __mutationObserverCallback };
