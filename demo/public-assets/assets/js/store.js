/**
 * SimpleStore — lightweight reactive pub/sub state for session data.
 * No persistence — all state lives in memory for the current session only.
 */
class SimpleStore {
  constructor(initialState) {
    this._state = { ...initialState };
    this._listeners = {};
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    this._state[key] = value;
    this._notify(key, value);
  }

  push(key, item) {
    const arr = this._state[key];
    if (!Array.isArray(arr)) return;
    arr.push(item);
    this._notify(key, arr);
  }

  on(key, callback) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(callback);
    return () => {
      this._listeners[key] = this._listeners[key].filter(fn => fn !== callback);
    };
  }

  clear(key) {
    if (Array.isArray(this._state[key])) {
      this._state[key] = [];
    } else {
      this._state[key] = null;
    }
    this._notify(key, this._state[key]);
  }

  _notify(key, value) {
    const listeners = this._listeners[key];
    if (listeners) listeners.forEach(fn => fn(value, key));
    const wildcard = this._listeners['*'];
    if (wildcard) wildcard.forEach(fn => fn(value, key));
  }
}

// Global store instance
var appStore = new SimpleStore({
  // Request Builder
  requestHistory: [],

  // Event Monitor
  eventLog: [],
  eventFilters: {
    dataUpdated: true,
    filtersUpdated: true,
    variablesUpdated: true,
    appData: true,
    ack: true,
    navigate: true,
    http: true,
  },
  autoScroll: true,

  // Test Suite
  testResults: {},

  // Cross-cutting
  activeTab: 'request',
  debugEnabled: false,
});
