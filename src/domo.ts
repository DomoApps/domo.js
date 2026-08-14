import { __mutationObserverCallback } from "./init";
import { handleDataUpdated, onDataUpdated } from "./models/services/dataset";
import { handleFiltersUpdated, onFiltersUpdated, requestFiltersUpdate } from "./models/services/filters";
import { handleVariablesUpdated, onVariablesUpdated, requestVariablesUpdate } from "./models/services/variables";
import { handleAppData, onAppDataUpdated, requestAppDataUpdate } from "./models/services/appdata";
import { navigate } from "./models/services/navigation";
import { codeEngine } from "./models/services/codeengine";
import { workflow } from "./models/services/workflow";
import { ai } from "./models/services/ai";
import { data } from "./models/services/data";
import { appdb } from "./models/services/appdb";
import { buildEnv } from "./models/services/env";
import { transport } from "./transport";
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
  generateUniqueId,
} from "./utils/general";
import { DomoEvent } from "./models/constants/general";
import { AskReplyMap } from "./models/interfaces/ask-reply";
import { handleAck, handleReply } from "./utils/ask-reply";
import { domoDebug } from "./utils/debug";
import { addInterceptor } from "./models/services/interceptors";
import {
  broadcast,
  onBroadcast,
  onBroadcastOnce,
  onBroadcastFrom,
  handleBroadcast,
  BroadcastCallback,
} from './broadcast';
import { Filter } from "./models/interfaces/filter";
import { Variable } from "./models/interfaces/variable";

export interface DomoListeners {
  onDataUpdated: ((alias: string) => void)[];
  onFiltersUpdated: ((filters: Filter[], requestId?: string) => void)[];
  onAppDataUpdated: ((appData: string, requestId?: string) => void)[];
  onVariablesUpdated: ((variables: Variable[]) => void)[];
  onBroadcast: BroadcastCallback[];
  [key: string]: Function[];
}

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
  private static requests: AskReplyMap = {};
  public static channel?: MessageChannel;
  public static connected = false;
  public static listeners: DomoListeners = {
    onDataUpdated: [],
    onFiltersUpdated: [],
    onAppDataUpdated: [],
    onVariablesUpdated: [],
    onBroadcast: [],
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
  static requestFiltersUpdate = requestFiltersUpdate;
  static requestVariablesUpdate = requestVariablesUpdate;
  static requestAppDataUpdate = requestAppDataUpdate;
  static navigate = navigate;
  static broadcast = broadcast;
  static onBroadcast = onBroadcast;
  static onBroadcastOnce = onBroadcastOnce;
  static onBroadcastFrom = onBroadcastFrom;
  static codeEngine = codeEngine;
  static workflow = workflow;
  static ai = ai;
  static data = data;
  static appdb = appdb;

  /* @deprecated */
  static readonly filterContainer = this.requestFiltersUpdate;
  /* @deprecated */
  static readonly sendVariables = this.requestVariablesUpdate;
  /* @deprecated */
  static readonly sendAppData = this.requestAppDataUpdate;

  ///////////////////////////////////////////
  // General
  /////////////////////////////////////////
  static handleAck = handleAck;
  static handleReply = handleReply;
  static getRequests = () => this.requests;
  static getRequest = (requestId: string) => this.requests[requestId];
  static readonly env = buildEnv();
  static readonly __util = {
    isVerifiedOrigin,
    getQueryParams,
    setFormatHeaders,
    isSuccess,
  };
  static debug = domoDebug;
  static intercept = addInterceptor;

  /**
   * Connects to the parent window's Domo instance using a MessageChannel.
   * This method sets up message handlers for various events like filtersUpdated, appData, and variablesUpdated.
   * It also sends a subscription message to the parent window.
   *
   * Also sets up a legacy window.postMessage listener for backward compatibility with v4.7.0 and earlier.
   *
   * @param skipFilters - If true, skips the initial filter updates.
   */
  private static connect = (skipFilters = false) => {
    if (this.connected) return;
    this.connected = true;
    this.channel = new MessageChannel();
    const subscribePayload = { requestId: generateUniqueId(), event: "subscribe", skipFilters };
    domoDebug.log('messages', 'sent:postMessage', 'subscribe', subscribePayload);
    window.parent.postMessage(
      JSON.stringify(subscribePayload),
      "*",
      [this.channel.port2]
    );

    const eventHandlers: Record<string, (data: any, responsePort?: MessagePort) => void> = {
      [DomoEvent.dataUpdated]: handleDataUpdated.bind(this),
      [DomoEvent.filtersUpdated]: handleFiltersUpdated.bind(this),
      [DomoEvent.appData]: handleAppData.bind(this),
      [DomoEvent.variablesUpdated]: handleVariablesUpdated.bind(this),
      [DomoEvent.ack]: handleAck.bind(this),
      [DomoEvent.broadcast]: (data: any, responsePort?: MessagePort) => handleBroadcast(this.listeners.onBroadcast, data, responsePort),
    };

    // MessageChannel listener (current/new implementation)
    this.channel.port1.onmessage = (e: MessageEvent) => {
      domoDebug.log('messages', 'received:channel', e.data.event, e.data);
      const [responsePort] = e.ports;
      const handler = eventHandlers[e.data.event];
      handler?.(e.data, responsePort);
    };

    // Legacy window.postMessage listener (v4.7.0 and earlier compatibility)
    const legacyMessageHandler = (event: MessageEvent) => {
      // Verify origin for security
      if (!isVerifiedOrigin(event.origin)) {
        return;
      }

      // Parse message
      let message: any;
      try {
        if (typeof event.data === 'string' && event.data.length > 0) {
          message = JSON.parse(event.data);
        } else if (typeof event.data === 'object') {
          message = event.data;
        } else {
          return;
        }
      } catch (err) {
        // Invalid JSON, ignore
        return;
      }

      // Detect legacy data update format (has 'alias' property but no 'event' property)
      if (message.hasOwnProperty('alias') && !message.hasOwnProperty('event')) {
        // Legacy data update message
        domoDebug.log('messages', 'received:postMessage', DomoEvent.dataUpdated, message);
        const handler = eventHandlers[DomoEvent.dataUpdated];
        if (handler) {
          handler(message);

          // Send legacy acknowledgment back to parent
          if (event.source && typeof (event.source as any).postMessage === 'function') {
            const ack = JSON.stringify({ event: "ack", alias: message.alias });
            domoDebug.log('messages', 'sent:ack', 'ack', { event: "ack", alias: message.alias });
            (event.source as any).postMessage(ack, event.origin);
          }
        }
        return;
      }

      // Handle standard event-based messages
      if (message.event) {
        domoDebug.log('messages', 'received:postMessage', message.event, message);
        const handler = eventHandlers[message.event as keyof typeof DomoEvent];
        if (handler) {
          handler(message);

          // Send acknowledgment back for non-ack events
          if (message.event !== 'ack' && event.source && typeof (event.source as any).postMessage === 'function') {
            const ack: any = {
              requestId: message.requestId,
              event: "ack"
            };

            // Include relevant data in ack based on event type
            if (message.event === DomoEvent.dataUpdated) {
              ack.alias = message.alias;
            } else if (message.event === DomoEvent.filtersUpdated) {
              ack.filters = message.filters;
            } else if (message.event === DomoEvent.variablesUpdated) {
              ack.variables = message.variables;
            }

            domoDebug.log('messages', 'sent:ack', 'ack', ack);
            (event.source as any).postMessage(JSON.stringify(ack), event.origin);
          }
        }
      }
    };

    window.addEventListener('message', legacyMessageHandler);
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
    const transportKeys = ["get", "post", "put", "delete"] as const;
    for (const key in overrides) {
      if (Object.prototype.hasOwnProperty.call(Domo, key)) {
        (Domo as any)[key as keyof typeof Domo] =
          overrides[key as keyof typeof Domo];

        // Keep the shared transport in sync so namespace services
        // (appdb, data, ai, workflow, codeEngine) see the override too.
        if (transportKeys.includes(key as any)) {
          (transport as any)[key] = overrides[key as keyof typeof Domo];
        }
      }
    }
  }
}

declare global {
  interface Window {
    domo: typeof Domo;
  }
}

// Native mobile hosts reach the SDK by resolving `window.domo` through evaluateJavaScript;
// a WebView has no parent frame, so inbound postMessage is not available to them.
if (typeof window !== 'undefined') window.domo = Domo;

export default Domo;
export { Domo, __mutationObserverCallback };
