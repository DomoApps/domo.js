/**
 * TestSuite — merged test definitions and execution logic.
 * Combines test metadata from tests.js with the card-based UI builder
 * and runner from DomoTestApp.
 *
 * Globals used: DOMUtils, ResultFormatter, DataRenderer, ExportUtils,
 *               GeneralUtils (from renderer.js)
 *               CATEGORY_META, STATUS_LABELS (from config.js)
 */

// ── Event aliases and resolution helpers ────────────────────────────

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

// ── Event feature names ─────────────────────────────────────────────

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

// ── URL param helpers ──────────────────────────────────────────────

// Read all query params off the iframe URL into a plain object.
// Mirrors src/utils/general.ts:getQueryParams() so we assert on the
// raw wire surface, not the normalized domo.env shape.
function readQueryParams() {
  const result = {};
  const query = (location.search || "").replace(/^\?/, "");
  if (!query) return result;
  query.split("&").forEach(function (part) {
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    const val = eq === -1 ? "" : decodeURIComponent(part.slice(eq + 1));
    if (key) result[key] = val;
  });
  return result;
}

// Snapshot of everything a param card needs to decide pass/fail.
// Read fresh on each test run so re-running after registering event
// listeners or after env loads gives the up-to-date answer.
function getParamSnapshot() {
  const params = readQueryParams();
  const isEmbedded =
    typeof window.ENV !== "undefined" || /\/embed\//.test(location.pathname);
  return {
    params: params,
    isEmbedded: isEmbedded,
    hasPageId: Boolean(params.pageId),
    hasDataAppId: Boolean(params.dataAppId),
  };
}

// ── Param validity checkers ────────────────────────────────────────

function isNonEmpty(s) { return typeof s === "string" && s.length > 0; }
function isDigits(s)   { return isNonEmpty(s) && /^\d+$/.test(s); }
function isEmail(s)    { return isNonEmpty(s) && /.+@.+\..+/.test(s); }
function isLocale(s)   { return isNonEmpty(s) && /^[a-z]{2}(-[A-Z]{2})?$/.test(s); }
function isPlatform(s) { return s === "desktop" || s === "mobile"; }
function isJsonArray(s) {
  if (!isNonEmpty(s)) return false;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed);
  } catch (_) {
    return false;
  }
}

// ── Param test card factory ────────────────────────────────────────

// Build a test definition that asserts presence, validity, and contextual
// expectation of a single URL param.
//
//   name           — param name (used as test name and card id)
//   description    — short blurb shown in the card header
//   validate       — (value) => true | string. true = valid, string = error msg
//   isExpected     — (snapshot) => true | false
//   expectedReason — (snapshot, expected) => human-readable string
function makeParamCard(name, opts) {
  return {
    name: "param." + name,
    category: "params",
    description: opts.description,
    fn: function (_params) {
      const snap = getParamSnapshot();
      const value = snap.params[name];
      const found = isNonEmpty(value);
      const expected = opts.isExpected(snap);
      const reason = opts.expectedReason(snap, expected);

      if (found) {
        const valid = opts.validate(value);
        if (valid !== true) {
          throw new Error("Invalid value: " + valid + " (got " + JSON.stringify(value) + ")");
        }
      }
      if (expected && !found) {
        throw new Error(name + ": expected but missing");
      }
      if (!expected && found) {
        throw new Error(name + ": present but not expected here (value=" + JSON.stringify(value) + ")");
      }

      return {
        _render: "payload",
        direction: "received",
        method: "url-param",
        payload: {
          param: name,
          status: found ? "Found" : "Missing",
          value: found ? value : "N/A",
          expected: reason,
          valid: found ? "yes" : "n/a",
        },
      };
    },
  };
}

// ── Test definitions ────────────────────────────────────────────────

const testDefinitions = [
  // ── Data API ────────────────────────────────────────────────────
  {
    name: "data.query",
    category: "data",
    description: "Query a dataset by alias with the Data API helper",
    fields: [
      { key: "limit", label: "Limit", value: "5", size: "small" },
    ],
    fn: async (params) => {
      if (!domo.data?.query) throw new Error("Not available in this version");
      const alias = "test";
      const limit = parseInt(params?.limit || "5", 10) || 5;
      const startTime = performance.now();
      const result = await domo.data.query(alias, { limit });
      const endTime = performance.now();
      return {
        _render: "http", httpMethod: "GET",
        url: `/data/v1/${alias}?limit=${limit}`,
        payload: result, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Queries the <code>test</code> dataset alias",
  },
  {
    name: "data.query (ignorePageFilters)",
    category: "data",
    description: "Query a dataset by alias with page filters bypassed",
    fields: [
      { key: "limit", label: "Limit", value: "5", size: "small" },
    ],
    fn: async (params) => {
      if (!domo.data?.query) throw new Error("Not available in this version");
      const alias = "test";
      const limit = parseInt(params?.limit || "5", 10) || 5;
      const startTime = performance.now();
      const result = await domo.data.query(alias, { limit, ignorePageFilters: true });
      const endTime = performance.now();
      return {
        _render: "http", httpMethod: "GET",
        url: `/data/v1/${alias}?limit=${limit}&ignorePageFilters=true`,
        payload: result, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Queries the <code>test</code> dataset alias with <code>ignorePageFilters=true</code>",
  },
  {
    name: "data.sql",
    category: "data",
    description: "Execute a SQL query against datasets",
    fields: [
      { key: "sql", label: "SQL", value: "SELECT * FROM test LIMIT 5", size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.data?.sql) throw new Error("Not available in this version");
      const alias = "test";
      const sqlQuery = params?.sql || "SELECT * FROM test LIMIT 5";
      const startTime = performance.now();
      const result = await domo.data.sql(alias, sqlQuery);
      const endTime = performance.now();
      return {
        _render: "payload", direction: "received", method: "data.sql",
        payload: result, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Runs a SQL query against the <code>test</code> alias",
  },

  // ── AppDB ──────────────────────────────────────────────────────
  {
    name: "appdb.list",
    category: "appdb",
    description: "List all documents in an AppDB collection",
    fn: async () => {
      if (!domo.appdb?.list) throw new Error("Not available in this version");
      const startTime = performance.now();
      const docs = await domo.appdb.list("SanityTest");
      const endTime = performance.now();
      return {
        _render: "http", httpMethod: "GET",
        url: "/domo/datastores/v1/collections/SanityTest/documents/",
        payload: docs, timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "appdb.create",
    category: "appdb",
    description: "Create a new document (auto-wraps in content if needed)",
    fields: [
      { key: "doc", label: "Document (JSON)", value: '{"foo":"bar"}', size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.appdb?.create) throw new Error("Not available in this version");
      let doc;
      try { doc = JSON.parse(params?.doc || '{"foo":"bar"}'); } catch (e) { throw new Error("Invalid JSON: " + e.message); }
      doc.timestamp = new Date().toISOString();
      const startTime = performance.now();
      const result = await domo.appdb.create("SanityTest", doc);
      const endTime = performance.now();
      if (result?.id) {
        window.__lastAppDbDocId = result.id;
        // Auto-populate docId fields on update and remove cards
        document.querySelectorAll('input[data-key="docId"]').forEach(function(input) {
          input.value = result.id;
        });
      }
      return {
        _render: "payload", direction: "sent", method: "appdb.create",
        payload: { sent: doc, response: result },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
  },
  {
    name: "appdb.update",
    category: "appdb",
    description: "Update an existing document (auto-wraps in content if needed)",
    fields: [
      { key: "docId", label: "Document ID", value: '', size: "wide" },
      { key: "doc", label: "Document (JSON)", value: '{"foo":"baz"}', size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.appdb?.update) throw new Error("Not available in this version");
      const docId = params?.docId || window.__lastAppDbDocId;
      if (!docId) throw new Error("Supply a document ID or run appdb.create first");
      let doc;
      try { doc = JSON.parse(params?.doc || '{"foo":"baz"}'); } catch (e) { throw new Error("Invalid JSON: " + e.message); }
      doc.updated = new Date().toISOString();
      const startTime = performance.now();
      const result = await domo.appdb.update("SanityTest", docId, doc);
      const endTime = performance.now();
      return {
        _render: "payload", direction: "sent", method: "appdb.update",
        payload: { docId, sent: doc, response: result },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Run <code>appdb.create</code> first to get a document ID",
  },
  {
    name: "appdb.remove",
    category: "appdb",
    description: "Delete a document by ID",
    fields: [
      { key: "docId", label: "Document ID", value: '', size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.appdb?.remove) throw new Error("Not available in this version");
      const docId = params?.docId || window.__lastAppDbDocId;
      if (!docId) throw new Error("Supply a document ID or run appdb.create first");
      const startTime = performance.now();
      const result = await domo.appdb.remove("SanityTest", docId);
      const endTime = performance.now();
      window.__lastAppDbDocId = null;
      return {
        _render: "payload", direction: "sent", method: "appdb.remove",
        payload: { docId, response: result },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Run <code>appdb.create</code> first to get a document ID",
  },

  {
    name: "appdb.query",
    category: "appdb",
    description: "Query with aggregations (groupby fields with spaces)",
    fields: [
      { key: "groupby", label: "Group By", value: "content.Work Item Owner", size: "wide" },
      { key: "count", label: "Count Alias", value: "ownerCount", size: "small" },
    ],
    fn: async (params) => {
      if (!domo.appdb?.query) throw new Error("Not available in this version");
      const groupby = params?.groupby || "content.Work Item Owner";
      const count = params?.count || "ownerCount";
      const aggs = { groupby, count };
      const startTime = performance.now();
      const result = await domo.appdb.query("SanityTest", {}, aggs);
      const endTime = performance.now();

      // Build the URL the same way the SDK does so we can show it
      const qp = new URLSearchParams();
      if (groupby) qp.set("groupby", groupby);
      if (count) qp.set("count", count);
      const url = `/domo/datastores/v1/collections/SanityTest/documents/query?${qp.toString()}`;

      return {
        _render: "http", httpMethod: "POST",
        url,
        payload: result,
        timing: `${(endTime - startTime).toFixed(2)}ms`,
      };
    },
    pendingMsg: "Queries <code>SanityTest</code> with groupby containing spaces",
  },

  // ── Events ─────────────────────────────────────────────────────
  {
    name: "requestFiltersUpdate",
    category: "events",
    description: "Request an update to page filters",
    fields: [
      { key: "column", label: "Column", value: "id", size: "small" },
      { key: "operator", label: "Operator", value: "GREAT_THAN_EQUALS_TO", size: "medium" },
      { key: "value", label: "Value", value: "1", size: "small" },
    ],
    fn: (params) => {
      const method = domo.requestFiltersUpdate ? "requestFiltersUpdate"
        : domo.filterContainer ? "filterContainer" : null;
      if (!method) throw new Error("Not available in this version");
      const filters = [
        { column: params?.column || "id", operator: params?.operator || "GREAT_THAN_EQUALS_TO", values: [isNaN(params?.value) ? params?.value : Number(params?.value || 1)], dataType: "numeric" }
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
    description: "Send variable updates by functionId, name, or both",
    fields: [
      { key: "functionId", label: "Function ID", value: "83942", size: "small" },
      { key: "name", label: "Variable Name", value: "", size: "medium" },
      { key: "value", label: "Value", value: "1", size: "small" },
    ],
    fn: (params) => {
      const method = domo.requestVariablesUpdate ? "requestVariablesUpdate"
        : domo.sendVariables ? "sendVariables" : null;
      if (!method) throw new Error("Not available in this version");
      const val = isNaN(params?.value) ? params?.value : Number(params?.value || 1);
      const variable = { value: val };
      const fidStr = (params?.functionId || "").trim();
      if (fidStr) {
        const parsed = parseInt(fidStr, 10);
        if (!isNaN(parsed)) variable.functionId = parsed;
      }
      const nameStr = (params?.name || "").trim();
      if (nameStr) variable.name = nameStr;
      if (!variable.functionId && !variable.name) {
        throw new Error("Provide at least a Function ID or Variable Name");
      }
      const payload = [variable];
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
    fields: [
      { key: "appData", label: "App Data", value: "onAppDataUpdated works", size: "wide" },
    ],
    fn: (params) => {
      const method = domo.requestAppDataUpdate ? "requestAppDataUpdate"
        : domo.sendAppData ? "sendAppData" : null;
      if (!method) throw new Error("Not available in this version");
      const payload = params?.appData || "onAppDataUpdated works";
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
  // ── Host Echo Correlation (DOMO-483472) ──────────────────────────
  {
    name: "onAppDataUpdated receives host requestId",
    category: "echo",
    description: "Synthesize an inbound appData message and assert the listener gets (appData, requestId)",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.onAppDataUpdated !== "function") return reject(new Error("Not available in this version"));
      var received = null;
      var unregister;
      try {
        unregister = domo.onAppDataUpdated(function(appData, requestId) {
          received = { appData: appData, requestId: requestId };
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }
      if (!domo.channel || !domo.channel.port1) { try { unregister && unregister(); } catch (e) {} return reject(new Error("MessageChannel not connected — open this app inside Domo")); }
      var port = new MessageChannel().port2;
      domo.channel.port1.onmessage({
        data: { event: "appData", appData: "synthetic-x", requestId: "req_synth_in_1" },
        ports: [port],
      });
      try { unregister && unregister(); } catch (e) {}
      if (!received) return reject(new Error("Callback did not fire"));
      if (received.appData !== "synthetic-x") return reject(new Error("appData mismatch: " + received.appData));
      if (received.requestId !== "req_synth_in_1") return reject(new Error("requestId 2nd arg missing or wrong: " + received.requestId));
      resolve({ _render: "payload", direction: "received", method: "onAppDataUpdated (synthetic)", payload: received });
    }),
  },
  {
    name: "onAppDataUpdated tolerates missing requestId",
    category: "echo",
    description: "Synthesize an inbound appData without requestId; 2nd arg should be undefined",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.onAppDataUpdated !== "function") return reject(new Error("Not available in this version"));
      var received = null;
      var unregister;
      try {
        unregister = domo.onAppDataUpdated(function(appData, requestId) {
          received = { appData: appData, requestId: requestId };
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }
      if (!domo.channel || !domo.channel.port1) { try { unregister && unregister(); } catch (e) {} return reject(new Error("MessageChannel not connected — open this app inside Domo")); }
      var port = new MessageChannel().port2;
      domo.channel.port1.onmessage({
        data: { event: "appData", appData: "no-id" },
        ports: [port],
      });
      try { unregister && unregister(); } catch (e) {}
      if (!received) return reject(new Error("Callback did not fire"));
      if (received.appData !== "no-id") return reject(new Error("appData mismatch"));
      if (received.requestId !== undefined) return reject(new Error("requestId should be undefined, got: " + String(received.requestId)));
      resolve({ _render: "payload", direction: "received", method: "onAppDataUpdated (synthetic, no id)", payload: received });
    }),
  },
  {
    name: "requestAppDataUpdate emits echoRequestId on wire",
    category: "echo",
    description: "Inspect SDK request store to assert echoRequestId is set distinct from requestId",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestAppDataUpdate !== "function") return reject(new Error("Not available in this version"));
      if (typeof domo.getRequests !== "function") return reject(new Error("domo.getRequests not available — SDK too old"));
      var requestsBefore = Object.keys(domo.getRequests());
      try { domo.requestAppDataUpdate("echo-test-payload", undefined, undefined, { echoRequestId: "req_echo_out_1" }); } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }
      var requestsAfter = Object.keys(domo.getRequests());
      var newIds = requestsAfter.filter(function(id) { return requestsBefore.indexOf(id) === -1; });
      if (newIds.length === 0) return reject(new Error("No new request recorded in SDK"));
      var captured = domo.getRequests()[newIds[0]].request.payload;
      if (!captured) return reject(new Error("No payload found in stored request"));
      if (captured.echoRequestId !== "req_echo_out_1") return reject(new Error("echoRequestId missing or wrong: " + captured.echoRequestId));
      if (!captured.requestId) return reject(new Error("SDK ACK requestId missing"));
      if (captured.requestId === captured.echoRequestId) return reject(new Error("requestId and echoRequestId must be distinct"));
      resolve({ _render: "payload", direction: "sent", method: "requestAppDataUpdate", payload: captured });
    }),
  },
  {
    name: "requestAppDataUpdate rejects invalid echoRequestId",
    category: "echo",
    description: "Pass '<script>' as echoRequestId; expect DomoValidationError",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestAppDataUpdate !== "function") return reject(new Error("Not available in this version"));
      var threw = false;
      var errName = null;
      try {
        domo.requestAppDataUpdate("payload", undefined, undefined, { echoRequestId: "<script>" });
      } catch (e) {
        threw = true;
        errName = e && e.name;
      }
      if (!threw) return reject(new Error("Expected a throw, but call returned normally"));
      if (errName !== "DomoValidationError") return reject(new Error("Expected DomoValidationError, got: " + errName));
      resolve({ _render: "payload", direction: "sent", method: "requestAppDataUpdate", payload: { errorName: errName, input: "<script>" } });
    }),
  },
  {
    name: "onFiltersUpdated receives host requestId",
    category: "echo",
    description: "Synthesize an inbound filtersUpdated message; listener should get (filters, requestId)",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.onFiltersUpdated !== "function") return reject(new Error("Not available in this version"));
      var received = null;
      var unregister;
      try {
        unregister = domo.onFiltersUpdated(function(filters, requestId) {
          received = { filters: filters, requestId: requestId };
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }
      if (!domo.channel || !domo.channel.port1) { try { unregister && unregister(); } catch (e) {} return reject(new Error("MessageChannel not connected — open this app inside Domo")); }
      var port = new MessageChannel().port2;
      var filters = [{ column: "x", operator: "IN", values: ["y"], dataType: "STRING" }];
      domo.channel.port1.onmessage({
        data: { event: "filtersUpdated", filters: filters, requestId: "req_synth_filter_1" },
        ports: [port],
      });
      try { unregister && unregister(); } catch (e) {}
      if (!received) return reject(new Error("Callback did not fire"));
      if (!Array.isArray(received.filters) || received.filters.length !== 1) return reject(new Error("filters not forwarded"));
      if (received.requestId !== "req_synth_filter_1") return reject(new Error("requestId 2nd arg missing or wrong: " + received.requestId));
      resolve({ _render: "payload", direction: "received", method: "onFiltersUpdated (synthetic)", payload: received });
    }),
  },
  {
    name: "requestFiltersUpdate emits echoRequestId on wire",
    category: "echo",
    description: "Inspect SDK request store to assert echoRequestId is set distinct from requestId",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestFiltersUpdate !== "function") return reject(new Error("Not available in this version"));
      if (typeof domo.getRequests !== "function") return reject(new Error("domo.getRequests not available — SDK too old"));
      var requestsBefore = Object.keys(domo.getRequests());
      var filters = [{ column: "x", operator: "IN", values: ["y"], dataType: "STRING" }];
      try { domo.requestFiltersUpdate(filters, null, undefined, undefined, { echoRequestId: "req_filter_out_1" }); } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }
      var requestsAfter = Object.keys(domo.getRequests());
      var newIds = requestsAfter.filter(function(id) { return requestsBefore.indexOf(id) === -1; });
      if (newIds.length === 0) return reject(new Error("No new request recorded in SDK"));
      var captured = domo.getRequests()[newIds[0]].request.payload;
      if (!captured) return reject(new Error("No payload found in stored request"));
      if (captured.echoRequestId !== "req_filter_out_1") return reject(new Error("echoRequestId missing or wrong: " + captured.echoRequestId));
      if (!captured.requestId) return reject(new Error("SDK ACK requestId missing"));
      if (captured.requestId === captured.echoRequestId) return reject(new Error("requestId and echoRequestId must be distinct"));
      resolve({ _render: "payload", direction: "sent", method: "requestFiltersUpdate", payload: captured });
    }),
  },
  {
    name: "Round-trip echo: requestFiltersUpdate → host echoes requestId → onFiltersUpdated receives it",
    category: "echo",
    description: "Simulates the full host echo cycle: SDK emits echoRequestId, host echoes it back on the next filtersUpdated, SDK delivers it to listener",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestFiltersUpdate !== "function") return reject(new Error("Not available in this version"));
      if (typeof domo.onFiltersUpdated !== "function") return reject(new Error("Not available in this version"));
      if (!domo.channel || !domo.channel.port1) return reject(new Error("MessageChannel not connected — open this app inside Domo"));

      var echoId = "roundtrip_filter_" + Date.now();
      var received = null;
      var unregister;

      try {
        unregister = domo.onFiltersUpdated(function(filters, requestId) {
          received = { filters: filters, requestId: requestId };
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }

      // Step 1: SDK sends requestFiltersUpdate with echoRequestId
      var filters = [{ column: "status", operator: "IN", values: ["active"], dataType: "STRING" }];
      try {
        domo.requestFiltersUpdate(filters, null, undefined, undefined, { echoRequestId: echoId });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }

      // Step 2: Simulate host echoing the echoRequestId back as requestId on inbound filtersUpdated
      var responseFilters = [{ column: "status", operator: "IN", values: ["active"], dataType: "STRING" }];
      var port = new MessageChannel().port2;
      domo.channel.port1.onmessage({
        data: { event: "filtersUpdated", filters: responseFilters, requestId: echoId },
        ports: [port],
      });

      // Step 3: Assert the listener received the echoed requestId
      try { unregister && unregister(); } catch (e) {}
      if (!received) return reject(new Error("Listener did not fire"));
      if (received.requestId !== echoId) return reject(new Error("Round-trip requestId mismatch: expected " + echoId + ", got " + received.requestId));
      if (!Array.isArray(received.filters) || received.filters.length !== 1) return reject(new Error("Filters not forwarded correctly"));
      resolve({ _render: "payload", direction: "both", method: "requestFiltersUpdate → onFiltersUpdated (round-trip)", payload: { echoRequestId: echoId, received: received } });
    }),
  },
  {
    name: "Round-trip echo: requestAppDataUpdate → host echoes requestId → onAppDataUpdated receives it",
    category: "echo",
    description: "Simulates the full host echo cycle for appData: SDK emits echoRequestId, host echoes it back, SDK delivers it to listener",
    fn: () => new Promise(function(resolve, reject) {
      if (typeof domo.requestAppDataUpdate !== "function") return reject(new Error("Not available in this version"));
      if (typeof domo.onAppDataUpdated !== "function") return reject(new Error("Not available in this version"));
      if (!domo.channel || !domo.channel.port1) return reject(new Error("MessageChannel not connected — open this app inside Domo"));

      var echoId = "roundtrip_appdata_" + Date.now();
      var received = null;
      var unregister;

      try {
        unregister = domo.onAppDataUpdated(function(appData, requestId) {
          received = { appData: appData, requestId: requestId };
        });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }

      // Step 1: SDK sends requestAppDataUpdate with echoRequestId
      try {
        domo.requestAppDataUpdate("roundtrip-payload", undefined, undefined, { echoRequestId: echoId });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "SecurityError")) throw e;
      }

      // Step 2: Simulate host echoing the echoRequestId back as requestId on inbound appData
      var port = new MessageChannel().port2;
      domo.channel.port1.onmessage({
        data: { event: "appData", appData: "host-response-payload", requestId: echoId },
        ports: [port],
      });

      // Step 3: Assert the listener received the echoed requestId
      try { unregister && unregister(); } catch (e) {}
      if (!received) return reject(new Error("Listener did not fire"));
      if (received.requestId !== echoId) return reject(new Error("Round-trip requestId mismatch: expected " + echoId + ", got " + received.requestId));
      if (received.appData !== "host-response-payload") return reject(new Error("appData mismatch: " + received.appData));
      resolve({ _render: "payload", direction: "both", method: "requestAppDataUpdate → onAppDataUpdated (round-trip)", payload: { echoRequestId: echoId, received: received } });
    }),
  },
  // ── Code Engine ─────────────────────────────────────────────────
  {
    name: "codeEngine",
    category: "codeengine",
    description: "Run a Code Engine function by alias",
    fields: [
      { key: "input", label: "Input (JSON)", value: '{"number1AppInput":5,"number2AppInput":10}', size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.codeEngine) throw new Error("Not available in this version");
      const alias = "awesomeFunction";
      let input;
      try { input = JSON.parse(params?.input || '{"number1AppInput":5,"number2AppInput":10}'); } catch (e) { throw new Error("Invalid JSON: " + e.message); }
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
    fields: [
      { key: "prompt", label: "Prompt", value: "Tell me a one-sentence joke about data.", size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.ai?.generateText) throw new Error("Not available in this version");
      const input = params?.prompt || "Tell me a one-sentence joke about data.";
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
    fields: [
      { key: "input", label: "Question", value: "Show me total sales by region", size: "wide" },
    ],
    fn: async (params) => {
      if (!domo.ai?.textToSQL) throw new Error("Not available in this version");
      const input = params?.input || "Show me total sales by region";
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
  // ── Utilities ──────────────────────────────────────────────────
  {
    name: "domo.env",
    category: "utils",
    description: "Environment context from query params + /domo/environment/v1",
    fn: () => {
      if (!domo.env) throw new Error("Not available in this version");
      return {
        _render: "payload", direction: "received", method: "domo.env",
        payload: {
          userId: domo.env.userId,
          userName: domo.env.userName,
          userEmail: domo.env.userEmail,
          customer: domo.env.customer,
          host: domo.env.host,
          locale: domo.env.locale,
          platform: domo.env.platform,
          pageId: domo.env.pageId,
          analyzer: domo.env.analyzer,
          loaded: domo.env.loaded,
        },
      };
    },
  },

  // ── DX Tools ──────────────────────────────────────────────────
  {
    name: "debug-mode",
    category: "dx",
    description: "Toggle debug logging for HTTP, messages, filters, variables",
    fn: () => {
      if (!domo.debug) throw new Error("Not available in this version");
      // Enable, log a test message, then disable
      const wasPreviouslyEnabled = domo.debug.enabled;
      domo.debug.enable(["http", "messages", "filters", "variables"]);
      const categories = [...domo.debug.categories];
      domo.debug.log("http", "Demo test: debug mode is working");
      if (!wasPreviouslyEnabled) domo.debug.disable();
      return {
        _render: "payload", direction: "received", method: "domo.debug",
        payload: {
          enabled: domo.debug.enabled,
          testedCategories: categories,
          note: wasPreviouslyEnabled
            ? "Debug was already enabled — left it on"
            : "Enabled, logged a test message, then disabled. Check browser console.",
        },
      };
    },
  },
  {
    name: "interceptors",
    category: "dx",
    description: "Register a request interceptor that logs timing",
    fn: async () => {
      if (!domo.intercept) throw new Error("Not available in this version");
      let intercepted = null;
      const remove = domo.intercept(async (config, next) => {
        const start = performance.now();
        const response = await next(config);
        intercepted = {
          method: config.method,
          url: config.url,
          headerCount: Object.keys(config.headers).length,
          timing: `${(performance.now() - start).toFixed(2)}ms`,
        };
        return response;
      });
      // Fire a real request through the interceptor
      try {
        await domo.get("/domo/datastores/v1/collections/SanityTest/documents/");
      } catch (e) {
        // Even if the request fails, the interceptor should have run
      }
      remove(); // clean up
      if (!intercepted) throw new Error("Interceptor was not called");
      return {
        _render: "payload", direction: "received", method: "domo.intercept()",
        payload: {
          interceptedRequest: intercepted,
          cleanedUp: true,
        },
      };
    },
    pendingMsg: "Registers an interceptor, fires a GET, verifies it was called, then removes it",
  },
  {
    name: "structured-errors",
    category: "dx",
    description: "Verify structured error types on a 404 response",
    fn: async () => {
      if (!domo.get) throw new Error("Not available in this version");
      const startTime = performance.now();
      try {
        await domo.get("/domo/this-endpoint-does-not-exist-404");
        throw new Error("Request should have failed");
      } catch (error) {
        const endTime = performance.now();
        const errorInfo = {
          name: error.name || "Error",
          message: error.message,
          hasStatus: typeof error.status === "number",
          status: error.status,
          hasBody: typeof error.body === "string",
          hasHeaders: typeof error.headers === "object",
          isDomoHttpError: error.constructor?.name === "DomoHttpError" || error.name === "DomoHttpError",
        };
        // If it's a "Request should have failed" error, re-throw
        if (error.message === "Request should have failed") throw error;
        return {
          _render: "payload", direction: "received", method: "error inspection",
          payload: errorInfo,
          timing: `${(endTime - startTime).toFixed(2)}ms`
        };
      }
    },
    pendingMsg: "Hits a nonexistent endpoint and inspects the error type",
  },
  {
    name: "schema-validation",
    category: "dx",
    description: "Test runtime schema validation on HTTP responses",
    fn: async () => {
      if (!domo.get) throw new Error("Not available in this version");
      // Create a simple schema that always passes
      const passingSchema = { parse: (data) => data };
      const startTime = performance.now();
      const result = await domo.get("/domo/datastores/v1/collections/SanityTest/documents/", { schema: passingSchema });
      const endTime = performance.now();

      // Now test a schema that rejects
      let rejectionCaught = false;
      const failingSchema = { parse: () => { throw new Error("Schema rejected"); } };
      try {
        await domo.get("/domo/datastores/v1/collections/SanityTest/documents/", { schema: failingSchema });
      } catch (e) {
        rejectionCaught = e.name === "DomoValidationError" || e.message?.includes("validation failed");
      }

      return {
        _render: "payload", direction: "received", method: "schema validation",
        payload: {
          passingSchemaResult: Array.isArray(result) ? `Array(${result.length})` : typeof result,
          failingSchemaRejected: rejectionCaught,
        },
        timing: `${(endTime - startTime).toFixed(2)}ms`
      };
    },
    pendingMsg: "Tests both a passing and failing schema against a real endpoint",
  },
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

  // ── URL Params ─────────────────────────────────────────────────
  makeParamCard("userId", {
    description: "Numeric user ID — always emitted",
    validate: function (v) { return isDigits(v) || "must be all digits"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("userName", {
    description: "Display name — always emitted",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("userEmail", {
    description: "User email — always emitted",
    validate: function (v) { return isEmail(v) || "must look like an email"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("customer", {
    description: "Domo instance/customer — always emitted (regression: dropped post-pivot, restored by DOMO-483881)",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("locale", {
    description: "User locale — always emitted",
    validate: function (v) { return isLocale(v) || "must be xx or xx-XX"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("environment", {
    description: "Domo environment name — always emitted",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("platform", {
    description: "Platform — always emitted as desktop or mobile",
    validate: function (v) { return isPlatform(v) || "must be desktop or mobile"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  {
    name: "param.analyzer",
    category: "params",
    description: "Initial filter blob — emitted when manifest acceptFilters !== false (informational; can't be verified from the iframe)",
    fn: function () {
      const snap = getParamSnapshot();
      const value = snap.params.analyzer;
      const found = isNonEmpty(value);
      if (found && !isJsonArray(value)) {
        throw new Error("analyzer: present but does not parse as a JSON array (value=" + JSON.stringify(value) + ")");
      }
      let parsed = null;
      if (found) {
        try { parsed = JSON.parse(value); } catch (_) { /* unreachable — isJsonArray verified */ }
      }
      return {
        _render: "payload",
        direction: "received",
        method: "url-param",
        payload: {
          param: "analyzer",
          status: found ? "Found" : "Missing",
          filterCount: found ? parsed.length : "n/a",
          expected: "Informational — depends on manifest acceptFilters (not detectable at runtime)",
          valid: found ? "yes (parses as JSON array)" : "n/a",
        },
      };
    },
  },
  makeParamCard("pageId", {
    description: "Page ID — emitted when launched on a page (mutually exclusive with dataAppId)",
    validate: function (v) { return isDigits(v) || "must be all digits"; },
    isExpected: function (snap) { return !snap.hasDataAppId; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — not launched as a data app"
        : "No — dataAppId is present, so pageId is absent";
    },
  }),
  makeParamCard("dataAppId", {
    description: "Data App ID — emitted when launched as a data app (mutually exclusive with pageId)",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function (snap) { return !snap.hasPageId; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — not launched on a page"
        : "No — pageId is present, so dataAppId is absent";
    },
  }),
  makeParamCard("embedCode", {
    description: "Embed token — emitted only in embed mode (regression: renamed to embedToken post-pivot, restored by DOMO-483881)",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function (snap) { return snap.isEmbedded; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — app is loaded via embed"
        : "No — not embedded";
    },
  }),
  {
    name: "param.appData",
    category: "params",
    description: "Pass-through app data from the parent page (informational — present and absent are both fine)",
    fn: function () {
      const snap = getParamSnapshot();
      const value = snap.params.appData;
      const found = isNonEmpty(value);
      return {
        _render: "payload",
        direction: "received",
        method: "url-param",
        payload: {
          param: "appData",
          status: found ? "Found" : "Missing",
          value: found ? value : "N/A",
          expected: "Pass-through — present or absent are both fine",
          valid: found ? "yes" : "n/a",
        },
      };
    },
  },
  {
    name: "param.arg-*",
    category: "params",
    description: "appargs forwarded by the parent — lists every arg-* query param found",
    fn: function () {
      const snap = getParamSnapshot();
      const args = {};
      Object.keys(snap.params).forEach(function (key) {
        if (key.indexOf("arg-") === 0) {
          args[key] = snap.params[key];
        }
      });
      const count = Object.keys(args).length;
      return {
        _render: "payload",
        direction: "received",
        method: "url-param-rollup",
        payload: {
          status: count > 0 ? "Found " + count + " arg-* param(s)" : "No arg-* params present",
          values: args,
          expected: "Pass-through — manifest may or may not declare appargs",
        },
      };
    },
  },
  // ── Route Capture (DOMO-488031) ──────────────────────────────────────
  {
    name: "ROUTE_CHANGE: pushState triggers broadcast",
    category: "routing",
    description: "Calls history.pushState and asserts the SDK emits a ROUTE_CHANGE debug log within 150ms",
    fn: () => new Promise(function(resolve, reject) {
      if (!window.domo || !window.domo.debug) return reject(new Error("domo.debug not available — SDK too old"));
      var captured = [];
      var originalLog = window.domo.debug.log;
      var originalPath = window.location.pathname + window.location.search + window.location.hash;
      window.domo.debug.log = function(category, prefix, eventType, payload) {
        if (category === 'messages' && prefix === 'sent:postMessage' && eventType === 'ROUTE_CHANGE') {
          captured.push(payload);
        }
        if (originalLog) originalLog.apply(window.domo.debug, arguments);
      };
      history.pushState({}, '', '/test-route-capture');
      setTimeout(function() {
        window.domo.debug.log = originalLog;
        history.replaceState({}, '', originalPath);
        if (captured.length === 0) return reject(new Error("No ROUTE_CHANGE debug log emitted within 150ms"));
        var payload = captured[0];
        if (!payload || payload.type !== 'ROUTE_CHANGE') return reject(new Error("Payload missing type: " + JSON.stringify(payload)));
        if (payload.route !== '/test-route-capture') return reject(new Error("Route mismatch: " + payload.route));
        resolve({ _render: "payload", direction: "sent", method: "ROUTE_CHANGE (pushState)", payload: payload });
      }, 150);
    }),
  },
  {
    name: "ROUTE_CHANGE: replaceState triggers broadcast",
    category: "routing",
    description: "Calls history.replaceState and asserts the SDK emits a ROUTE_CHANGE debug log within 150ms",
    fn: () => new Promise(function(resolve, reject) {
      if (!window.domo || !window.domo.debug) return reject(new Error("domo.debug not available — SDK too old"));
      var captured = [];
      var originalLog = window.domo.debug.log;
      var originalPath = window.location.pathname + window.location.search + window.location.hash;
      window.domo.debug.log = function(category, prefix, eventType, payload) {
        if (category === 'messages' && prefix === 'sent:postMessage' && eventType === 'ROUTE_CHANGE') {
          captured.push(payload);
        }
        if (originalLog) originalLog.apply(window.domo.debug, arguments);
      };
      history.replaceState({}, '', '/test-replace-route');
      setTimeout(function() {
        window.domo.debug.log = originalLog;
        history.replaceState({}, '', originalPath);
        if (captured.length === 0) return reject(new Error("No ROUTE_CHANGE debug log emitted within 150ms"));
        var payload = captured[0];
        if (!payload || payload.type !== 'ROUTE_CHANGE') return reject(new Error("Payload missing type: " + JSON.stringify(payload)));
        if (payload.route !== '/test-replace-route') return reject(new Error("Route mismatch: " + payload.route));
        resolve({ _render: "payload", direction: "sent", method: "ROUTE_CHANGE (replaceState)", payload: payload });
      }, 150);
    }),
  },
  {
    name: "ROUTE_CHANGE: debounce collapses rapid pushState calls",
    category: "routing",
    description: "Three pushState calls within 100ms should emit exactly one ROUTE_CHANGE with the final route",
    fn: () => new Promise(function(resolve, reject) {
      if (!window.domo || !window.domo.debug) return reject(new Error("domo.debug not available — SDK too old"));
      var captured = [];
      var originalLog = window.domo.debug.log;
      var originalPath = window.location.pathname + window.location.search + window.location.hash;
      window.domo.debug.log = function(category, prefix, eventType, payload) {
        if (category === 'messages' && prefix === 'sent:postMessage' && eventType === 'ROUTE_CHANGE') {
          captured.push(payload);
        }
        if (originalLog) originalLog.apply(window.domo.debug, arguments);
      };
      history.pushState({}, '', '/debounce-1');
      history.pushState({}, '', '/debounce-2');
      history.pushState({}, '', '/debounce-final');
      setTimeout(function() {
        window.domo.debug.log = originalLog;
        history.replaceState({}, '', originalPath);
        if (captured.length === 0) return reject(new Error("No ROUTE_CHANGE emitted within 150ms"));
        if (captured.length > 1) return reject(new Error("Expected 1 ROUTE_CHANGE (debounced), got " + captured.length));
        var payload = captured[0];
        if (payload.route !== '/debounce-final') return reject(new Error("Expected /debounce-final, got: " + payload.route));
        resolve({ _render: "payload", direction: "sent", method: "ROUTE_CHANGE (debounced)", payload: { emitted: captured.length, finalRoute: payload.route } });
      }, 150);
    }),
  },

  // ── Broadcast ─────────────────────────────────────────────────
  {
    name: "broadcast",
    category: "broadcast",
    description: "Publish a message to a channel on the dashboard broadcast bus",
    fields: [
      { key: "channel", label: "Channel", value: APP_CONFIG.PUBLISH_CHANNEL, size: "medium" },
      { key: "payload", label: "Payload", value: '42', size: "wide" },
    ],
    fn: (params) => {
      if (!domo.broadcast) throw new Error("Not available in this version");
      const channel = params?.channel || APP_CONFIG.PUBLISH_CHANNEL;
      const raw = params?.payload || '42';
      let payload;
      try { payload = JSON.parse(raw); } catch (e) { payload = raw; }
      const startTime = performance.now();
      domo.broadcast(channel, payload);
      const endTime = performance.now();
      return {
        _render: "payload", direction: "sent", method: "broadcast",
        payload: { channel, payload },
        timing: `${(endTime - startTime).toFixed(2)}ms`,
      };
    },
    pendingMsg: `Publishes to channel <code>${APP_CONFIG.PUBLISH_CHANNEL}</code> on the page bus`,
  },
  {
    name: "onBroadcast",
    category: "broadcast",
    description: "Subscribe to a channel and display messages as they arrive",
    fields: [
      { key: "channel", label: "Channel", value: APP_CONFIG.SUBSCRIBE_CHANNEL, size: "medium" },
    ],
    fn: () => new Promise(), // Never resolves - event driven
    customButton: true,
  },
];

// ── Helper functions ────────────────────────────────────────────────

function getTestsByCategory(category) {
  if (category === 'all') return testDefinitions;
  return testDefinitions.filter(feature => feature.category === category);
}

function isEventDrivenTest(testName) {
  return EVENT_FEATURES.includes(testName) || testName === "requestAppDataUpdate" || testName === "onBroadcast";
}

// ── TestSuite class ─────────────────────────────────────────────────

class TestSuite {
  constructor(store) {
    this.store = store;
    this.eventsRegistered = false;
    this.container = null;
    this.statsManager = null;

    this.runAll = this.runAll.bind(this);
    this.clearAll = this.clearAll.bind(this);
    this.exportResults = this.exportResults.bind(this);
    this.registerEventListeners = this.registerEventListeners.bind(this);
  }

  /* -------------------------------------------------------------------
     mount(container) — builds card UI grouped by category
     ------------------------------------------------------------------- */

  mount(container) {
    this.container = container;
    // Stats managed inline — no external StatisticsManager dependency

    // Group test definitions by category
    const groups = {};
    testDefinitions.forEach((f) => {
      const cat = f.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });

    Object.entries(groups).forEach(([cat, items]) => {
      const meta = CATEGORY_META[cat] || { icon: '?', label: cat, cssClass: cat };

      const group = DOMUtils.createElement("section", { className: "category-group" });
      group.innerHTML = `
        <div class="category-header">
          <div class="category-icon category-icon--${meta.cssClass}">${meta.icon}</div>
          <span class="category-title">${meta.label}</span>
          <span class="category-count">${items.length}</span>
          <button class="btn btn-small btn-run category-run-btn" data-category="${cat}">Run Category</button>
        </div>
        <div class="test-cards" id="cards-${cat}"></div>
      `;
      container.appendChild(group);

      // Wire up "Run Category" button
      const runCatBtn = group.querySelector('.category-run-btn');
      if (runCatBtn) {
        runCatBtn.addEventListener("click", () => this.runCategory(cat));
      }

      const cardsEl = group.querySelector(".test-cards");

      items.forEach(({ name, description, pendingMsg, customButton, fields }) => {
        const isEvent = isEventDrivenTest(name);
        const card = DOMUtils.createElement("div", {
          className: "test-card",
          id: `card-${name}`,
        });

        // Actions
        let actionsHTML = '';
        if (isEvent && name !== 'requestAppDataUpdate' && name !== 'onBroadcast') {
          actionsHTML = `<span class="event-hint">event-driven</span>`;
        } else if (name === 'requestAppDataUpdate') {
          actionsHTML = `<button class="btn btn-small btn-run" id="requestAppDataUpdateBtn">Send App Data</button>
                         <span id="requestAppDataUpdateResult" style="font-size:0.72rem;color:var(--text-muted);"></span>`;
        } else if (name === 'onBroadcast') {
          actionsHTML = `<button class="btn btn-small btn-run" id="onBroadcastBtn">Subscribe</button>
                         <span id="onBroadcastResult" style="font-size:0.72rem;color:var(--text-muted);"></span>`;
        } else {
          actionsHTML = `
            <button class="btn btn-small btn-run" data-run="${name}">Run</button>
            <button class="btn btn-small btn-clear" data-clear="${name}">Clear</button>
          `;
        }

        // Editable fields
        let fieldsHTML = '';
        if (fields && fields.length) {
          fieldsHTML = '<div class="test-card__fields">';
          fields.forEach(function(f) {
            const sizeClass = f.size === 'wide' ? 'test-card__field--wide' : f.size === 'medium' ? 'test-card__field--medium' : '';
            fieldsHTML += `<label class="test-card__field ${sizeClass}">`;
            fieldsHTML += `<span>${DataRenderer.escapeHTML(f.label)}</span>`;
            fieldsHTML += `<input class="test-card__field-input" data-test="${name}" data-key="${f.key}" value="${DataRenderer.escapeHTML(f.value)}" />`;
            fieldsHTML += `</label>`;
          });
          fieldsHTML += '</div>';
        }

        const detailsContent = isEvent && !customButton
          ? (pendingMsg || "Not registered")
          : (pendingMsg || "");

        card.innerHTML = `
          <div class="test-card__info">
            <div class="test-card__name">${name}</div>
            <div class="test-card__desc">${description || ''}</div>
            ${fieldsHTML}
            <div class="test-card__details" id="details-${name}">${detailsContent}</div>
          </div>
          <div id="status-${name}">
            <span class="status pending">Pending</span>
          </div>
          <div class="test-card__actions">${actionsHTML}</div>
        `;

        // Wire up Run / Clear buttons via delegation
        const runBtn = card.querySelector('[data-run]');
        if (runBtn) {
          runBtn.addEventListener("click", () => this.runSingle(name));
        }
        const clearBtn = card.querySelector('[data-clear]');
        if (clearBtn) {
          clearBtn.addEventListener("click", () => this.clearSingle(name));
        }

        cardsEl.appendChild(card);
      });
    });

    // Build hidden table rows for StatisticsManager & ExportUtils compat
    const tbody = DOMUtils.querySelector("#reportTable tbody");
    if (tbody) {
      testDefinitions.forEach(({ name }) => {
        const tr = DOMUtils.createElement("tr", { id: `row-${name}` });
        tr.innerHTML = `
          <td class="feature-name">${name}</td>
          <td><span class="status pending">Pending</span></td>
          <td class="details"></td>
          <td></td>
        `;
        tbody.appendChild(tr);
      });
    }

    // Wire up the Send App Data button
    this._setupRequestAppDataUpdate();
    this._setupOnBroadcast();
    this._updateStats();
  }

  /* -------------------------------------------------------------------
     registerEventListeners()
     ------------------------------------------------------------------- */

  registerEventListeners() {
    if (this.eventsRegistered) return;

    // Seed the filters listener array to prevent the SDK from clearing
    // the parent page's filters.
    const noop = () => {};
    const filtersKey = resolveListenerKey("onFiltersUpdated");
    if (filtersKey) {
      window.domo.listeners[filtersKey].push(noop);
    }

    EVENT_FEATURES.forEach((canonicalName) => {
      const resolvedMethod = resolveEventMethod(canonicalName);

      if (!resolvedMethod) {
        this._updateCard(canonicalName, "fail", "Not available in this version");
        return;
      }

      try {
        const label = resolvedMethod !== canonicalName
          ? `${canonicalName} (via ${resolvedMethod})`
          : canonicalName;
        GeneralUtils.logInfo("registerEventListeners", `Registering: ${label}`);

        window.domo[resolvedMethod]((arg) => {
          GeneralUtils.logInfo("Event", `${resolvedMethod} triggered`, arg);
          const via = resolvedMethod !== canonicalName ? resolvedMethod : null;

          // Parse the arg for display
          let payload = arg;
          if (typeof arg === "string") {
            try { payload = JSON.parse(arg); } catch (_) { /* keep as string */ }
          }

          const msg = DataRenderer.renderPayload(
            "received", resolvedMethod, payload,
            { via: via }
          );

          this._updateCard(canonicalName, "success", msg);

          // Flash the card
          const card = DOMUtils.getElementById(`card-${canonicalName}`);
          if (card) {
            card.classList.remove("test-card--event-fired");
            void card.offsetWidth; // force reflow
            card.classList.add("test-card--event-fired");
          }
        });

        const feature = testDefinitions.find(f => f.name === canonicalName);
        let pendingMsg = feature?.pendingMsg || "Listening...";
        if (resolvedMethod !== canonicalName) {
          pendingMsg += ` <span style="color:var(--text-muted);font-size:0.7rem;">(via ${resolvedMethod})</span>`;
        }
        this._updateCard(canonicalName, "pending", pendingMsg);
      } catch (e) {
        GeneralUtils.logError(`registerEventListeners - ${canonicalName}`, e);
        this._updateCard(canonicalName, "fail", e.message);
      }
    });

    // Remove the noop seed
    if (filtersKey) {
      const idx = window.domo.listeners[filtersKey].indexOf(noop);
      if (idx >= 0) window.domo.listeners[filtersKey].splice(idx, 1);
    }

    this.eventsRegistered = true;
    this._dismissEventBanner();
    this._updateStats();
  }

  /* -------------------------------------------------------------------
     runAll() — runs all non-event tests sequentially
     ------------------------------------------------------------------- */

  async runAll() {
    // Reset non-event cards to pending
    for (const { name } of testDefinitions) {
      if (isEventDrivenTest(name)) continue;
      this._updateCard(name, "pending", "");
    }

    for (const test of testDefinitions) {
      if (isEventDrivenTest(test.name)) continue;
      await this._runTest(test);
    }

    this._updateStats();
  }

  /* -------------------------------------------------------------------
     runCategory(category) — runs tests for a specific category
     ------------------------------------------------------------------- */

  async runCategory(category) {
    const tests = getTestsByCategory(category);

    for (const test of tests) {
      if (isEventDrivenTest(test.name)) continue;
      await this._runTest(test);
    }

    this._updateStats();
  }

  /* -------------------------------------------------------------------
     runSingle(testName) — runs one test
     ------------------------------------------------------------------- */

  async runSingle(testName) {
    const test = testDefinitions.find(f => f.name === testName);
    if (!test || isEventDrivenTest(testName)) return;

    await this._runTest(test);
    this._updateStats();
  }

  /* -------------------------------------------------------------------
     clearAll() — resets all non-event test cards
     ------------------------------------------------------------------- */

  clearAll() {
    testDefinitions.forEach(({ name, pendingMsg }) => {
      if (!isEventDrivenTest(name)) {
        this._updateCard(name, "pending", pendingMsg || "");
      }
    });

    const appDataResult = DOMUtils.getElementById("requestAppDataUpdateResult");
    if (appDataResult) DOMUtils.setElementContent(appDataResult, "");

    const broadcastResult = DOMUtils.getElementById("onBroadcastResult");
    if (broadcastResult) DOMUtils.setElementContent(broadcastResult, "");

    this._updateStats();
  }

  /* -------------------------------------------------------------------
     clearSingle(testName) — resets one card
     ------------------------------------------------------------------- */

  clearSingle(testName) {
    const feature = testDefinitions.find(f => f.name === testName);
    if (!feature) return;

    this._updateCard(testName, "pending", feature.pendingMsg || "");
    this._updateStats();
  }

  /* -------------------------------------------------------------------
     exportResults() — reuses ExportUtils
     ------------------------------------------------------------------- */

  exportResults() {
    const results = ExportUtils.createResultsExport(testDefinitions);
    const filename = `domo-js-test-results-${new Date().toISOString().split('T')[0]}.json`;
    ExportUtils.downloadJSON(results, filename);
  }

  /* -------------------------------------------------------------------
     _runTest(test) — internal: run a single test, update card
     ------------------------------------------------------------------- */

  _readFieldValues(testName) {
    const params = {};
    const inputs = document.querySelectorAll(`input[data-test="${testName}"]`);
    inputs.forEach(function(input) {
      params[input.getAttribute('data-key')] = input.value;
    });
    return Object.keys(params).length > 0 ? params : undefined;
  }

  async _runTest(test) {
    const { name, fn } = test;

    try {
      this._updateCard(name, "running", "Running...");
      const params = this._readFieldValues(name);
      const result = await fn(params);
      const details = ResultFormatter.formatTestResult(result, name);

      this._updateCard(name, "success", details);
    } catch (e) {
      const msg = e.message || String(e);
      if (msg === "Not available in this version") {
        this._updateCard(name, "skipped", msg);
      } else {
        GeneralUtils.logError(`Test ${name}`, e);
        this._updateCard(name, "fail", msg);
      }
    }
  }

  /* -------------------------------------------------------------------
     _updateCard(name, status, details) — updates card + hidden row
     ------------------------------------------------------------------- */

  _updateCard(name, status, details) {
    // Toggle dimmed state for skipped tests
    const card = DOMUtils.getElementById(`card-${name}`);
    if (card) {
      card.classList.toggle("test-card--skipped", status === "skipped");
    }

    // Update card status badge
    const statusEl = DOMUtils.getElementById(`status-${name}`);
    if (statusEl) {
      const icon = ResultFormatter.getStatusIcon(status);
      const label = STATUS_LABELS[status] || STATUS_LABELS.pending;
      statusEl.innerHTML = `<span class="status ${status}">${icon} ${label}</span>`;
    }

    // Update details area
    if (!isEventDrivenTest(name) || status === "success") {
      const detailsEl = DOMUtils.getElementById(`details-${name}`);
      if (detailsEl) {
        detailsEl.innerHTML = details;
      }
    }

    // Sync hidden table row
    const row = DOMUtils.getElementById(`row-${name}`);
    if (row) {
      const statusIcon = ResultFormatter.getStatusIcon(status);
      const statusCell = row.children[1];
      DOMUtils.setElementContent(statusCell,
        `<span class="status ${status}">${statusIcon} ${STATUS_LABELS[status] || STATUS_LABELS.pending}</span>`,
        true
      );

      if (!isEventDrivenTest(name)) {
        const detailsCell = row.children[2];
        DOMUtils.setElementContent(detailsCell, details, true);
      }
    }
  }

  /* -------------------------------------------------------------------
     _updateStats() — counts pass/fail/pending/skipped, updates stat elements
     ------------------------------------------------------------------- */

  _updateStats() {
    var total = 0, passed = 0, failed = 0, pending = 0;
    var statuses = document.querySelectorAll('#tab-content-tests .status');
    statuses.forEach(function(el) {
      total++;
      if (el.classList.contains('success')) passed++;
      else if (el.classList.contains('fail')) failed++;
      else if (el.classList.contains('pending') || el.classList.contains('running')) pending++;
    });
    var totalEl = document.getElementById('totalTests');
    var passedEl = document.getElementById('passedTests');
    var failedEl = document.getElementById('failedTests');
    var pendingEl = document.getElementById('pendingTests');
    if (totalEl) totalEl.textContent = String(total);
    if (passedEl) passedEl.textContent = String(passed);
    if (failedEl) failedEl.textContent = String(failed);
    if (pendingEl) pendingEl.textContent = String(pending);
  }

  /* -------------------------------------------------------------------
     _setupRequestAppDataUpdate() — wire up the Send App Data button
     ------------------------------------------------------------------- */

  _setupRequestAppDataUpdate() {
    const btn = DOMUtils.getElementById("requestAppDataUpdateBtn");
    if (!btn) return;

    const resultSpan = DOMUtils.getElementById("requestAppDataUpdateResult");

    btn.addEventListener("click", async () => {
      try {
        const feature = testDefinitions.find((f) => f.name === "requestAppDataUpdate");
        const params = this._readFieldValues("requestAppDataUpdate");
        await feature.fn(params);
        if (resultSpan) {
          resultSpan.textContent = "Sent!";
          resultSpan.style.color = "var(--accent-green)";
        }
      } catch (e) {
        if (resultSpan) {
          resultSpan.textContent = `Failed: ${e?.message || e}`;
          resultSpan.style.color = "var(--accent-red)";
        }
      }
    });
  }

  /* -------------------------------------------------------------------
     _setupOnBroadcast() — wire up the Subscribe button
     ------------------------------------------------------------------- */

  _setupOnBroadcast() {
    const btn = DOMUtils.getElementById("onBroadcastBtn");
    if (!btn) return;
    const resultSpan = DOMUtils.getElementById("onBroadcastResult");
    let subscribed = false;
    btn.addEventListener("click", () => {
      if (subscribed) return;
      if (!domo.onBroadcast) {
        this._updateCard("onBroadcast", "fail", "Not available in this version");
        return;
      }
      const params = this._readFieldValues("onBroadcast");
      const channel = params?.channel || APP_CONFIG.SUBSCRIBE_CHANNEL;
      subscribed = true;
      if (resultSpan) {
        resultSpan.textContent = `Listening on "${channel}"...`;
        resultSpan.style.color = "var(--text-muted)";
      }
      domo.onBroadcast(channel, (msg) => {
        const formatted = DataRenderer.renderPayload("received", "onBroadcast", msg);
        this._updateCard("onBroadcast", "success", formatted);
        const card = DOMUtils.getElementById("card-onBroadcast");
        if (card) {
          card.classList.remove("test-card--event-fired");
          void card.offsetWidth; // force reflow
          card.classList.add("test-card--event-fired");
        }
      });
    });
  }

  /* -------------------------------------------------------------------
     _dismissEventBanner() — same animation logic as current
     ------------------------------------------------------------------- */

  _dismissEventBanner() {
    const banner = DOMUtils.getElementById("eventBanner");
    if (!banner || banner.classList.contains("event-banner--dismissed")) return;
    banner.classList.add("event-banner--dismissed");
    banner.addEventListener("animationend", () => banner.remove(), { once: true });
  }
}
