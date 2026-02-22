"use strict";
var DomoEmulatorAutoInit = (() => {
  // src/panel.ts
  var PANEL_ID = "__domo_emulator__";
  var MAX_LOG_ENTRIES = 10;
  function createPanel(options) {
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();
    const container = document.createElement("div");
    container.id = PANEL_ID;
    container.style.cssText = [
      "position:fixed",
      "bottom:16px",
      "right:16px",
      "z-index:2147483647",
      "font-family:monospace",
      "font-size:12px",
      "background:#1a1a2e",
      "color:#e0e0e0",
      "border-radius:8px",
      "box-shadow:0 4px 24px rgba(0,0,0,0.5)",
      "min-width:280px",
      "max-width:380px",
      "overflow:hidden"
    ].join(";");
    const header = document.createElement("div");
    header.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "padding:8px 12px",
      "background:#16213e",
      "cursor:pointer",
      "user-select:none"
    ].join(";");
    const title = document.createElement("span");
    title.textContent = "\u{1F50C} Domo Emulator";
    title.style.cssText = "font-weight:bold;color:#00d4ff;";
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "\u25BC";
    toggleBtn.style.cssText = [
      "background:none",
      "border:none",
      "color:#00d4ff",
      "cursor:pointer",
      "font-size:14px",
      "padding:0",
      "line-height:1"
    ].join(";");
    header.appendChild(title);
    header.appendChild(toggleBtn);
    const body = document.createElement("div");
    body.style.cssText = "padding:10px 12px;";
    const btnStyle = [
      "display:inline-block",
      "margin:3px 4px 3px 0",
      "padding:4px 10px",
      "border-radius:4px",
      "border:1px solid #00d4ff",
      "background:transparent",
      "color:#00d4ff",
      "cursor:pointer",
      "font-size:11px",
      "font-family:monospace",
      "transition:background 0.15s"
    ].join(";");
    const btnHover = "background:#00d4ff;color:#1a1a2e;";
    function makeBtn(label, onClick) {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = btnStyle;
      btn.addEventListener("mouseover", () => btn.style.cssText = btnStyle + btnHover);
      btn.addEventListener("mouseout", () => btn.style.cssText = btnStyle);
      btn.addEventListener("click", onClick);
      return btn;
    }
    const actionsRow = document.createElement("div");
    actionsRow.style.cssText = "margin-bottom:8px;";
    actionsRow.appendChild(makeBtn("Send Filters", options.onSendFilters));
    actionsRow.appendChild(makeBtn("Send Variables", options.onSendVariables));
    actionsRow.appendChild(makeBtn("Send Data Update", options.onSendDataUpdate));
    actionsRow.appendChild(makeBtn("Send App Data", options.onSendAppData));
    const logLabel = document.createElement("div");
    logLabel.textContent = "Message log";
    logLabel.style.cssText = "color:#888;margin-bottom:4px;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;";
    const logContainer = document.createElement("div");
    logContainer.style.cssText = [
      "max-height:140px",
      "overflow-y:auto",
      "background:#0f0f1a",
      "border-radius:4px",
      "padding:4px 6px"
    ].join(";");
    const emptyMsg = document.createElement("div");
    emptyMsg.textContent = "(no messages yet)";
    emptyMsg.style.cssText = "color:#555;font-style:italic;padding:2px 0;";
    logContainer.appendChild(emptyMsg);
    body.appendChild(actionsRow);
    body.appendChild(logLabel);
    body.appendChild(logContainer);
    container.appendChild(header);
    container.appendChild(body);
    document.body.appendChild(container);
    let collapsed = false;
    function toggleCollapse() {
      collapsed = !collapsed;
      body.style.display = collapsed ? "none" : "block";
      toggleBtn.textContent = collapsed ? "\u25B2" : "\u25BC";
    }
    header.addEventListener("click", toggleCollapse);
    function updateLog(entries) {
      logContainer.innerHTML = "";
      if (entries.length === 0) {
        logContainer.appendChild(emptyMsg.cloneNode(true));
        return;
      }
      const recent = entries.slice(-MAX_LOG_ENTRIES);
      for (const entry of recent) {
        const row = document.createElement("div");
        row.style.cssText = "padding:2px 0;border-bottom:1px solid #222;word-break:break-all;";
        const arrow = entry.dir === "in" ? "\u2192" : "\u2190";
        const color = entry.dir === "in" ? "#4ade80" : "#f87171";
        const time = new Date(entry.at).toISOString().slice(11, 23);
        row.innerHTML = `<span style="color:${color}">${arrow} ${entry.event}</span> <span style="color:#666;font-size:10px">${time}</span>`;
        logContainer.appendChild(row);
      }
      logContainer.scrollTop = logContainer.scrollHeight;
    }
    function remove() {
      container.remove();
    }
    return { updateLog, remove };
  }

  // src/core.ts
  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  var DomoEmulator = class {
    constructor(config2 = {}) {
      this.port2 = null;
      this.log = [];
      this.installed = false;
      this.panel = null;
      this.config = config2;
      this.boundOnMessage = this.onMessage.bind(this);
    }
    install() {
      if (this.installed) return;
      if (window.parent !== window) return;
      this.installed = true;
      window.addEventListener("message", this.boundOnMessage, { capture: true });
      if (document.body) {
        this.initPanel();
      } else {
        document.addEventListener("DOMContentLoaded", () => this.initPanel());
      }
    }
    initPanel() {
      var _a2, _b;
      const alias = (_a2 = this.config.dataAlias) != null ? _a2 : "default";
      const appData = (_b = this.config.appData) != null ? _b : "{}";
      this.panel = createPanel({
        onSendFilters: () => {
          var _a3;
          if ((_a3 = this.config.filters) == null ? void 0 : _a3.length) {
            this.pushFiltersUpdated(this.config.filters);
          }
        },
        onSendVariables: () => {
          var _a3;
          if ((_a3 = this.config.variables) == null ? void 0 : _a3.length) {
            this.pushVariablesUpdated(this.config.variables);
          }
        },
        onSendDataUpdate: () => {
          this.pushDataUpdated(alias);
        },
        onSendAppData: () => {
          this.pushAppData(appData);
        }
      });
    }
    onMessage(e) {
      var _a2;
      let parsed = null;
      try {
        parsed = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch (e2) {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const event = parsed.event;
      if (!event) return;
      if (event === "subscribe" && e.ports[0]) {
        this.port2 = e.ports[0];
        e.stopImmediatePropagation();
        this.addLog("in", "subscribe", parsed);
        const delay = (_a2 = this.config.initialDelayMs) != null ? _a2 : 50;
        setTimeout(() => this.sendInitialState(), delay);
        return;
      }
      if (["filter", "variable", "navigate", "appData"].includes(event)) {
        this.addLog("out", event, parsed);
      }
    }
    pushFiltersUpdated(filters) {
      if (!this.port2) return;
      const ackChannel = new MessageChannel();
      const requestId = uuid();
      ackChannel.port1.onmessage = (e) => {
        this.addLog("in", "ack:filtersUpdated", e.data);
      };
      this.port2.postMessage(
        { event: "filtersUpdated", filters, requestId },
        [ackChannel.port2]
      );
      this.addLog("in", "filtersUpdated", { filters, requestId });
    }
    pushVariablesUpdated(variables) {
      if (!this.port2) return;
      const ackChannel = new MessageChannel();
      const requestId = uuid();
      ackChannel.port1.onmessage = (e) => {
        this.addLog("in", "ack:variablesUpdated", e.data);
      };
      this.port2.postMessage(
        { event: "variablesUpdated", variables, requestId },
        [ackChannel.port2]
      );
      this.addLog("in", "variablesUpdated", { variables, requestId });
    }
    pushDataUpdated(alias) {
      if (!this.port2) return;
      const ackChannel = new MessageChannel();
      const requestId = uuid();
      ackChannel.port1.onmessage = (e) => {
        this.addLog("in", "ack:dataUpdated", e.data);
      };
      this.port2.postMessage(
        { event: "dataUpdated", alias, requestId },
        [ackChannel.port2]
      );
      this.addLog("in", "dataUpdated", { alias, requestId });
    }
    pushAppData(appData) {
      if (!this.port2) return;
      const ackChannel = new MessageChannel();
      const requestId = uuid();
      ackChannel.port1.onmessage = (e) => {
        this.addLog("in", "ack:appDataUpdated", e.data);
      };
      this.port2.postMessage(
        { event: "appDataUpdated", appData, requestId },
        [ackChannel.port2]
      );
      this.addLog("in", "appDataUpdated", { appData, requestId });
    }
    sendInitialState() {
      var _a2, _b;
      if ((_a2 = this.config.filters) == null ? void 0 : _a2.length) {
        this.pushFiltersUpdated(this.config.filters);
      }
      if ((_b = this.config.variables) == null ? void 0 : _b.length) {
        this.pushVariablesUpdated(this.config.variables);
      }
      if (this.config.dataAlias) {
        this.pushDataUpdated(this.config.dataAlias);
      }
      if (this.config.appData) {
        this.pushAppData(this.config.appData);
      }
    }
    addLog(dir, event, payload) {
      var _a2;
      this.log.push({ dir, event, payload, at: Date.now() });
      (_a2 = this.panel) == null ? void 0 : _a2.updateLog(this.log);
    }
    getLog() {
      return [...this.log];
    }
    uninstall() {
      var _a2;
      if (!this.installed) return;
      window.removeEventListener("message", this.boundOnMessage, { capture: true });
      (_a2 = this.panel) == null ? void 0 : _a2.remove();
      this.panel = null;
      this.installed = false;
    }
  };

  // src/auto.ts
  var isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname
  );
  var isStandalone = window.parent === window;
  var _a;
  var config = (_a = window.__DOMO_MOCK__) != null ? _a : {};
  if (isLocalhost && isStandalone) {
    new DomoEmulator(config).install();
  }
})();
