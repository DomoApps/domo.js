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
  running: "Running"
};

// Event-driven features that can't be run on demand
const EVENT_FEATURES = [
  "onDataUpdated",
  "onFiltersUpdated", 
  "onVariablesUpdated",
  "onAppDataUpdated",
];

// Test feature definitions
const features = [
  {
    name: "http-get",
    category: "http",
    description: "Test HTTP GET requests to retrieve data",
    fn: async () => {
      if (!domo.get) throw new Error("Not implemented");
      const startTime = performance.now();
      const result = await domo.get("/domo/datastores/v1/collections/SanityTest/documents/");
      const endTime = performance.now();
      return {
        data: result,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "http-post",
    category: "http", 
    description: "Test HTTP POST requests to create new records",
    fn: async () => {
      if (!domo.post) throw new Error("Not implemented");
      const startTime = performance.now();
      const res = await domo.post(
        "/domo/datastores/v1/collections/SanityTest/documents/",
        { foo: "bar", timestamp: new Date().toISOString() }
      );
      const endTime = performance.now();
      if (!res?.id) throw new Error("POST did not return an ID");
      lastId = res.id;
      return {
        data: res,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "http-put",
    category: "http",
    description: "Test HTTP PUT requests to update existing records",
    fn: async () => {
      if (!lastId) throw new Error("No ID from POST test - run POST first");
      if (!domo.put) throw new Error("Not implemented");
      const startTime = performance.now();
      const result = await domo.put(
        `/domo/datastores/v1/collections/SanityTest/documents/${lastId}`,
        { foo: "baz", updated: new Date().toISOString() }
      );
      const endTime = performance.now();
      return {
        data: result,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "http-delete",
    category: "http",
    description: "Test HTTP DELETE requests to remove records",
    fn: async () => {
      if (!lastId) throw new Error("No ID from POST test - run POST first");
      if (!domo.delete) throw new Error("Not implemented");
      const startTime = performance.now();
      const result = await domo.delete(
        `/domo/datastores/v1/collections/SanityTest/documents/${lastId}`
      );
      const endTime = performance.now();
      return {
        data: result,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "requestFiltersUpdate",
    category: "events",
    description: "Request an update to page filters",
    fn: () => {
      if (!domo.requestFiltersUpdate) throw new Error("Not implemented");
      const filters = [
        {
          "column": "id",
          "operator": "GREAT_THAN_EQUALS_TO",
          "values": [
            1
          ],
          "dataType": "numeric"
        }
      ];
      const startTime = performance.now();
      domo.requestFiltersUpdate(filters);
      const endTime = performance.now();
      return {
        data: `Filter update requested with filters: ${JSON.stringify(filters)}`,
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "requestVariablesUpdate",
    category: "events",
    description: "Send variable updates to the dashboard",
    fn: () => {
      if (!domo.requestVariablesUpdate) throw new Error("Not implemented");
      const payload = [{ "functionId": 83942, "value": 1 }];
      const startTime = performance.now();
      domo.requestVariablesUpdate(JSON.stringify(payload));
      const endTime = performance.now();
      console.log("DomoApp: requestVariablesUpdate", payload);
      return {
        data: "Variable update sent",
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
      if (!domo.requestAppDataUpdate) throw new Error("Not implemented");
      const startTime = performance.now();
      domo.requestAppDataUpdate("onAppDataUpdated works");
      const endTime = performance.now();
      return {
        data: "App data update sent", 
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    customButton: true,
  },
  {
    name: "ios-detection",
    category: "utils",
    description: "Detect if the current device is running iOS",
    fn: () => {
      if (!GeneralUtils.isIOS) throw new Error("Not implemented");
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