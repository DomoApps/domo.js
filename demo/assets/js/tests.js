/**
 * Test configuration for domo.js library
 * Contains all test definitions, expected behaviors, and test metadata
 */

// Global test data
let lastId = null;

// Test status labels
const STATUS_LABELS = {
  success: "Passed",
  fail: "Failed",
  pending: "Pending",
  running: "Running",
  skipped: "N/A"
};

// Event-driven features that can't be run on demand.
// onFiltersUpdated MUST be first so its connect(skipFilters=false) is the
// call that actually fires — the subscribe event with skipFilters:false is
// what returns the current filters to the app. The no-op seed in
// registerEventListeners() prevents the accompanying requestFiltersUpdate(null)
// that would otherwise clear the parent's filters.
const EVENT_FEATURES = [
  "onFiltersUpdated",
  "onDataUpdated",
  "onVariablesUpdated",
  "onAppDataUpdated",
];

// Maps each canonical (v5.1+) event name to older aliases, in preference order.
// resolveEventMethod() tries each until it finds one that exists on `domo`.
const EVENT_ALIASES = {
  onFiltersUpdated:   ["onFiltersUpdated", "onFiltersUpdate"],
  onDataUpdated:      ["onDataUpdated", "onDataUpdate"],
  onVariablesUpdated: ["onVariablesUpdated"],
  onAppDataUpdated:   ["onAppDataUpdated", "onAppData"],
};

// Same mapping for the listeners key used by the noop-seed trick.
const LISTENER_KEY_ALIASES = {
  onFiltersUpdated: ["onFiltersUpdated", "onFiltersUpdate"],
};

/**
 * Resolve the actual method name available on the loaded domo object.
 * Returns { method, key } where `method` is the function name on `domo`,
 * or null if the event isn't supported by this version.
 */
function resolveEventMethod(canonicalName) {
  const candidates = EVENT_ALIASES[canonicalName] || [canonicalName];
  for (const name of candidates) {
    if (typeof window.domo[name] === "function") {
      return name;
    }
  }
  return null;
}

/**
 * Resolve the listeners key for the noop-seed trick.
 */
function resolveListenerKey(canonicalName) {
  const candidates = LISTENER_KEY_ALIASES[canonicalName] || [canonicalName];
  if (!window.domo.listeners) return null;
  for (const key of candidates) {
    if (Array.isArray(window.domo.listeners[key])) {
      return key;
    }
  }
  return null;
}

// Test feature definitions
const features = [
  {
    name: "http-get",
    category: "http",
    description: "Test HTTP GET requests to retrieve data",
    fn: async () => {
      if (!domo.get) throw new Error("Not available in this version");
      const url = "/domo/datastores/v1/collections/SanityTest/documents/";
      const startTime = performance.now();
      const result = await domo.get(url);
      const endTime = performance.now();
      return {
        _render: "http", httpMethod: "GET", url: url,
        payload: result, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "http-post",
    category: "http",
    description: "Test HTTP POST requests to create new records",
    fn: async () => {
      if (!domo.post) throw new Error("Not available in this version");
      const url = "/domo/datastores/v1/collections/SanityTest/documents/";
      const body = { foo: "bar", timestamp: new Date().toISOString() };
      const startTime = performance.now();
      const res = await domo.post(url, body);
      const endTime = performance.now();
      if (!res?.id) throw new Error("POST did not return an ID");
      lastId = res.id;
      return {
        _render: "http", httpMethod: "POST", url: url,
        payload: res, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "http-put",
    category: "http",
    description: "Test HTTP PUT requests to update existing records",
    fn: async () => {
      if (!lastId) throw new Error("No ID from POST test - run POST first");
      if (!domo.put) throw new Error("Not available in this version");
      const url = `/domo/datastores/v1/collections/SanityTest/documents/${lastId}`;
      const body = { foo: "baz", updated: new Date().toISOString() };
      const startTime = performance.now();
      const result = await domo.put(url, body);
      const endTime = performance.now();
      return {
        _render: "http", httpMethod: "PUT", url: url,
        payload: result, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "http-delete",
    category: "http",
    description: "Test HTTP DELETE requests to remove records",
    fn: async () => {
      if (!lastId) throw new Error("No ID from POST test - run POST first");
      if (!domo.delete) throw new Error("Not available in this version");
      const url = `/domo/datastores/v1/collections/SanityTest/documents/${lastId}`;
      const startTime = performance.now();
      const result = await domo.delete(url);
      const endTime = performance.now();
      return {
        _render: "http", httpMethod: "DELETE", url: url,
        payload: result, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "requestFiltersUpdate",
    category: "events",
    description: "Request an update to page filters",
    fn: () => {
      const method = domo.requestFiltersUpdate ? "requestFiltersUpdate"
        : domo.filterContainer ? "filterContainer" : null;
      if (!method) throw new Error("Not available in this version");
      const filters = [
        { column: "id", operator: "GREAT_THAN_EQUALS_TO", values: [1], dataType: "numeric" }
      ];
      const startTime = performance.now();
      domo[method](filters);
      const endTime = performance.now();
      const via = method !== "requestFiltersUpdate" ? method : null;
      return {
        _render: "payload", direction: "sent", method: method,
        payload: filters, via: via,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "requestVariablesUpdate",
    category: "events",
    description: "Send variable updates to the dashboard",
    fn: () => {
      const method = domo.requestVariablesUpdate ? "requestVariablesUpdate"
        : domo.sendVariables ? "sendVariables" : null;
      if (!method) throw new Error("Not available in this version");
      const payload = [{ functionId: 83942, value: 1 }];
      const startTime = performance.now();
      domo[method](JSON.stringify(payload));
      const endTime = performance.now();
      const via = method !== "requestVariablesUpdate" ? method : null;
      return {
        _render: "payload", direction: "sent", method: method,
        payload: payload, via: via,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "onDataUpdated",
    category: "events",
    description: "Listen for dataset updates",
    fn: () => new Promise(), // Never resolves - event driven
    pendingMsg: 'This will run when you change <a href="https://domo.demo.domo.com/datasources/f8956b7f-13cf-45f1-96dd-a27ed3910c18/details/overview" target="_blank">this dataset</a>.',
  },
  {
    name: "onFiltersUpdated", 
    category: "events",
    description: "Listen for filter changes",
    fn: () => new Promise(), // Never resolves - event driven
    pendingMsg: "This will run when you add or modify any filter on this page.",
  },
  {
    name: "onVariablesUpdated",
    category: "events", 
    description: "Listen for variable changes",
    fn: () => new Promise(), // Never resolves - event driven
    pendingMsg: "To trigger this, change the variable at the top of this page.",
  },
  {
    name: "onAppDataUpdated",
    category: "events",
    description: "Listen for app data updates",
    fn: () => new Promise(), // Never resolves - event driven  
    pendingMsg: "To trigger this, click the 'Send App Data' button—this app must be embedded.",
  },
  {
    name: "requestAppDataUpdate",
    category: "events",
    description: "Send app data to the dashboard",
    fn: () => {
      const method = domo.requestAppDataUpdate ? "requestAppDataUpdate"
        : domo.sendAppData ? "sendAppData" : null;
      if (!method) throw new Error("Not available in this version");
      const payload = "onAppDataUpdated works";
      const startTime = performance.now();
      domo[method](payload);
      const endTime = performance.now();
      const via = method !== "requestAppDataUpdate" ? method : null;
      return {
        _render: "payload", direction: "sent", method: method,
        payload: payload, via: via,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    customButton: true,
  },
  // ── Code Engine ─────────────────────────────────────────────────
  {
    name: "codeEngine",
    category: "codeengine",
    description: "Run a Code Engine function by alias",
    fn: async () => {
      if (!domo.codeEngine) throw new Error("Not available in this version");
      const alias = "awesomeFunction";
      const input = { number1AppInput: 5, number2AppInput: 10 };
      const startTime = performance.now();
      const result = await domo.codeEngine(alias, input);
      const endTime = performance.now();
      return {
        _render: "payload", direction: "sent", method: `codeEngine("${alias}")`,
        payload: { request: input, response: result },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Requires a Code Engine package mapped as <code>awesomeFunction</code> in manifest.json",
  },

  // ── Workflows ──────────────────────────────────────────────────
  {
    name: "workflow.start",
    category: "workflow",
    description: "Start a Workflow instance",
    fn: async () => {
      if (!domo.workflow?.start) throw new Error("Not available in this version");
      const alias = "testWorkflow";
      const startTime = performance.now();
      const instance = await domo.workflow.start(alias);
      const endTime = performance.now();
      // Store the instance ID so getInstance can use it
      window.__lastWorkflowInstanceId = instance.id;
      return {
        _render: "payload", direction: "sent", method: `workflow.start("${alias}")`,
        payload: instance,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Requires a Workflow mapped as <code>testWorkflow</code> in manifest.json",
  },
  {
    name: "workflow.getInstance",
    category: "workflow",
    description: "Check the status of a Workflow instance",
    fn: async () => {
      if (!domo.workflow?.getInstance) throw new Error("Not available in this version");
      const instanceId = window.__lastWorkflowInstanceId;
      if (!instanceId) throw new Error("Run workflow.start first to get an instance ID");
      const alias = "testWorkflow";
      const startTime = performance.now();
      const instance = await domo.workflow.getInstance(alias, instanceId);
      const endTime = performance.now();
      return {
        _render: "payload", direction: "received", method: `workflow.getInstance`,
        payload: instance, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Run <code>workflow.start</code> first, then check the instance status",
  },

  // ── AI Services ────────────────────────────────────────────────
  {
    name: "ai.generateText",
    category: "ai",
    description: "Generate text from a prompt",
    fn: async () => {
      if (!domo.ai?.generateText) throw new Error("Not available in this version");
      const input = "Tell me a one-sentence joke about data.";
      const startTime = performance.now();
      const result = await domo.ai.generateText(input);
      const endTime = performance.now();
      return {
        _render: "payload", direction: "received", method: "ai.generateText",
        payload: result,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Calls Domo AI text generation — uses AI credits",
  },
  {
    name: "ai.textToSQL",
    category: "ai",
    description: "Generate SQL from natural language",
    fn: async () => {
      if (!domo.ai?.textToSQL) throw new Error("Not available in this version");
      const input = "Show me total sales by region";
      const schemas = [{
        dataSourceName: "Sales",
        description: "Sales transactions",
        columns: [
          { name: "Region", type: "string" },
          { name: "Date", type: "date" },
          { name: "Amount", type: "number" },
        ],
      }];
      const startTime = performance.now();
      const result = await domo.ai.textToSQL(input, { dataSourceSchemas: schemas });
      const endTime = performance.now();
      return {
        _render: "payload", direction: "received", method: "ai.textToSQL",
        payload: { request: { input, dataSourceSchemas: schemas }, response: result },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Calls Domo AI text-to-SQL — uses AI credits",
  },
  {
    name: "ai.imageToText",
    category: "ai",
    description: "Extract text from an image (OCR)",
    fn: async () => {
      if (!domo.ai?.imageToText) throw new Error("Not available in this version");
      // Create a tiny 1x1 white PNG as a test image
      const canvas = document.createElement("canvas");
      canvas.width = 100; canvas.height = 30;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 100, 30);
      ctx.fillStyle = "#000";
      ctx.font = "16px sans-serif";
      ctx.fillText("Hello", 10, 22);
      const base64 = canvas.toDataURL("image/png");

      const startTime = performance.now();
      const result = await domo.ai.imageToText(
        "Return the text in the image",
        { mediaType: "image/png", type: "base64", data: base64 },
        "domo.domo_ai.domogpt-chat-medium-v1.1:anthropic",
      );
      const endTime = performance.now();
      return {
        _render: "payload", direction: "received", method: "ai.imageToText",
        payload: result,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Generates a test image with canvas, sends to Domo AI OCR — uses AI credits",
  },

  // ── Utilities ──────────────────────────────────────────────────
  {
    name: "ios-detection",
    category: "utils",
    description: "Detect if the current device is running iOS",
    fn: () => {
      if (!GeneralUtils.isIOS) throw new Error("Not available in this version");
      const startTime = performance.now();
      const isIOSResult = GeneralUtils.isIOS();
      const endTime = performance.now();
      
      // Gather detailed information for display
      const userAgent = navigator.userAgent;
      const hasIOSUserAgent = /(?:iphone|ipad|ipod)/.test(userAgent.toLowerCase());
      const isPossibleIPadDesktopMode = /mac os x/.test(userAgent.toLowerCase()) && 
        'ontouchend' in document && navigator.maxTouchPoints > 1;
      const hasIOSAPIs = window.webkit?.messageHandlers !== undefined;
      const isStandalone = navigator.standalone === true;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const screenInfo = window.screen ? `${window.screen.width}x${window.screen.height}` : 'unknown';
      
      return {
        data: {
          isIOS: isIOSResult,
          userAgent: userAgent,
          indicators: {
            hasIOSUserAgent,
            isPossibleIPadDesktopMode,
            hasIOSAPIs,
            isStandalone,
            devicePixelRatio,
            screenInfo,
            maxTouchPoints: navigator.maxTouchPoints || 0
          }
        },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
];

// Helper functions for test management
function getTestsByCategory(category) {
  if (category === 'all') return features;
  return features.filter(feature => feature.category === category);
}

function isEventDrivenTest(testName) {
  return EVENT_FEATURES.includes(testName) || testName === "requestAppDataUpdate";
}

function resetTestData() {
  lastId = null;
}

function getLastId() {
  return lastId;
}

function setLastId(id) {
  lastId = id;
}