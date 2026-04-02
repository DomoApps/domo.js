/**
 * Main application logic for domo.js test suite
 * Handles test execution, UI management, and event coordination
 */

const CATEGORY_META = {
  http:   { icon: '/', label: 'HTTP', cssClass: 'http' },
  events: { icon: '~', label: 'Events', cssClass: 'events' },
  utils:  { icon: '#', label: 'Utilities', cssClass: 'utils' },
};

class DomoTestApp {
  constructor() {
    this.features = features;
    this.statsManager = new StatisticsManager();
    this.isInitialized = false;
    this.eventsRegistered = false;

    this.runAllTests = this.runAllTests.bind(this);
    this.clearAllResults = this.clearAllResults.bind(this);
    this.exportResults = this.exportResults.bind(this);
    this.registerEventListeners = this.registerEventListeners.bind(this);
  }

  init() {
    if (this.isInitialized) return;

    if (!window.domo) {
      console.error("domo.js is not loaded.");
      document.body.innerHTML = "<h2 style='color:#ef4444;text-align:center;padding:4rem'>Error: domo.js is not loaded.</h2>";
      return;
    }

    this.buildCards();
    this.buildHiddenTableRows();
    this.setupUIEventListeners();

    this.isInitialized = true;
    GeneralUtils.logInfo("DomoTestApp", "Application initialized successfully");
  }

  /* -----------------------------------------------------------------------
     Card-based UI
     ----------------------------------------------------------------------- */

  buildCards() {
    const container = DOMUtils.getElementById("testContent");
    if (!container) return;

    // Group by category
    const groups = {};
    this.features.forEach((f) => {
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
        </div>
        <div class="test-cards" id="cards-${cat}"></div>
      `;
      container.appendChild(group);

      const cardsEl = group.querySelector(".test-cards");

      items.forEach(({ name, description, pendingMsg, customButton }) => {
        const isEvent = isEventDrivenTest(name);
        const card = DOMUtils.createElement("div", {
          className: "test-card",
          id: `card-${name}`,
        });

        // Actions
        let actionsHTML = '';
        if (isEvent && name !== 'requestAppDataUpdate') {
          actionsHTML = `<span class="event-hint">event-driven</span>`;
        } else if (customButton) {
          actionsHTML = `<button class="btn btn-small btn-run" id="requestAppDataUpdateBtn">Send App Data</button>
                         <span id="requestAppDataUpdateResult" style="font-size:0.72rem;color:var(--text-muted);"></span>`;
        } else {
          actionsHTML = `
            <button class="btn btn-small btn-run" onclick="window.testApp.runSingleTest('${name}')">Run</button>
            <button class="btn btn-small btn-clear" onclick="window.testApp.clearSingleTest('${name}')">Clear</button>
          `;
        }

        const detailsContent = isEvent && !customButton
          ? (pendingMsg || "Not registered")
          : (pendingMsg || "");

        card.innerHTML = `
          <div class="test-card__info">
            <div class="test-card__name">${name}</div>
            <div class="test-card__desc">${description || ''}</div>
            <div class="test-card__details" id="details-${name}">${detailsContent}</div>
          </div>
          <div id="status-${name}">
            <span class="status pending">Pending</span>
          </div>
          <div class="test-card__actions">${actionsHTML}</div>
        `;

        cardsEl.appendChild(card);
      });
    });

    // Wire up the Send App Data button
    this.setupRequestAppDataUpdate();
    this.statsManager.updateStats();
  }

  /* Keep hidden table rows for StatisticsManager & ExportUtils compat */
  buildHiddenTableRows() {
    const tbody = DOMUtils.querySelector("#reportTable tbody");
    if (!tbody) return;

    this.features.forEach(({ name }) => {
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

  /* -----------------------------------------------------------------------
     Event Registration
     ----------------------------------------------------------------------- */

  registerEventListeners() {
    if (this.eventsRegistered) return;

    // Seed the filters listener array to prevent the SDK from clearing
    // the parent page's filters. Resolve the correct key for this version.
    const noop = () => {};
    const filtersKey = resolveListenerKey("onFiltersUpdated");
    if (filtersKey) {
      window.domo.listeners[filtersKey].push(noop);
    }

    EVENT_FEATURES.forEach((canonicalName) => {
      const resolvedMethod = resolveEventMethod(canonicalName);

      if (!resolvedMethod) {
        this.updateRow(canonicalName, "fail", `Not available in this version`);
        return;
      }

      try {
        const label = resolvedMethod !== canonicalName
          ? `${canonicalName} (via ${resolvedMethod})`
          : canonicalName;
        GeneralUtils.logInfo("registerEventListeners", `Registering: ${label}`);

        window.domo[resolvedMethod]((arg) => {
          GeneralUtils.logInfo("Event", `${resolvedMethod} triggered`, arg);
          const timestamp = GeneralUtils.formatTimestamp();

          let msg;
          switch (canonicalName) {
            case "onDataUpdated":
              msg = `Callback ran at ${timestamp} with alias: ${arg}`;
              break;
            case "onAppDataUpdated":
              msg = `Callback ran at ${timestamp}. Data: ${arg}`;
              break;
            default:
              msg = `Callback ran successfully at ${timestamp}`;
          }

          if (resolvedMethod !== canonicalName) {
            msg += ` <span style="color:var(--text-muted);font-size:0.7rem;">(via ${resolvedMethod})</span>`;
          }

          this.updateRow(canonicalName, "success", msg);

          // Flash the card
          const card = DOMUtils.getElementById(`card-${canonicalName}`);
          if (card) {
            card.classList.remove("test-card--event-fired");
            void card.offsetWidth; // force reflow
            card.classList.add("test-card--event-fired");
          }
        });

        const pendingMsg = features.find(f => f.name === canonicalName)?.pendingMsg || "Listening...";
        const viaNote = resolvedMethod !== canonicalName
          ? ` <span style="color:var(--text-muted);font-size:0.7rem;">(via ${resolvedMethod})</span>`
          : "";
        this.updateRow(canonicalName, "pending", pendingMsg + viaNote);
      } catch (e) {
        GeneralUtils.logError(`registerEventListeners - ${canonicalName}`, e);
        this.updateRow(canonicalName, "fail", e.message);
      }
    });

    // Remove the noop seed
    if (filtersKey) {
      const idx = window.domo.listeners[filtersKey].indexOf(noop);
      if (idx >= 0) window.domo.listeners[filtersKey].splice(idx, 1);
    }

    this.eventsRegistered = true;
    this.dismissEventBanner();
    this.statsManager.updateStats();
  }

  dismissEventBanner() {
    const banner = DOMUtils.getElementById("eventBanner");
    if (!banner || banner.classList.contains("event-banner--dismissed")) return;
    banner.classList.add("event-banner--dismissed");
    banner.addEventListener("animationend", () => banner.remove(), { once: true });
  }

  /* -----------------------------------------------------------------------
     UI Event Listeners
     ----------------------------------------------------------------------- */

  setupUIEventListeners() {
    const runButton = DOMUtils.getElementById("runTests");
    const clearButton = DOMUtils.getElementById("clearResults");
    const exportButton = DOMUtils.getElementById("exportResults");
    if (runButton) runButton.addEventListener("click", this.runAllTests);
    if (clearButton) clearButton.addEventListener("click", this.clearAllResults);
    if (exportButton) exportButton.addEventListener("click", this.exportResults);

    const bannerBtn = DOMUtils.getElementById("bannerRegisterBtn");
    if (bannerBtn) bannerBtn.addEventListener("click", this.registerEventListeners);
  }

  setupRequestAppDataUpdate() {
    const btn = DOMUtils.getElementById("requestAppDataUpdateBtn");
    if (!btn) return;

    const resultSpan = DOMUtils.getElementById("requestAppDataUpdateResult");

    btn.addEventListener("click", async () => {
      try {
        const feature = this.features.find((f) => f.name === "requestAppDataUpdate");
        await feature.fn();
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

  /* -----------------------------------------------------------------------
     Test Execution
     ----------------------------------------------------------------------- */

  async runAllTests() {
    const runButton = DOMUtils.getElementById("runTests");
    const spinner = DOMUtils.getElementById("spinner");
    const runTestsText = DOMUtils.getElementById("runTestsText");

    if (!runButton || !spinner || !runTestsText) return;

    runButton.disabled = true;
    DOMUtils.toggleElementVisibility(spinner, true);
    DOMUtils.setElementContent(runTestsText, "Running...");

    for (const { name } of this.features) {
      if (isEventDrivenTest(name)) continue;
      this.updateRow(name, "pending", "");
    }

    for (const feat of this.features) {
      const { name, fn } = feat;
      if (isEventDrivenTest(name)) continue;

      try {
        this.updateRow(name, "running", "Running...");

        const result = await fn();
        const details = ResultFormatter.formatTestResult(result, name);

        this.updateRow(name, "success", details);
      } catch (e) {
        const msg = e.message || String(e);
        if (msg === "Not available in this version") {
          this.updateRow(name, "skipped", msg);
        } else {
          GeneralUtils.logError(`Test ${name}`, e);
          this.updateRow(name, "fail", msg);
        }
      }
    }

    runButton.disabled = false;
    DOMUtils.toggleElementVisibility(spinner, false);
    DOMUtils.setElementContent(runTestsText, "Run All Tests");
    this.statsManager.updateStats();
  }

  clearAllResults() {
    this.features.forEach(({ name, pendingMsg }) => {
      if (!isEventDrivenTest(name)) {
        this.updateRow(name, "pending", pendingMsg || "");
      }
    });

    resetTestData();

    const appDataResult = DOMUtils.getElementById("requestAppDataUpdateResult");
    if (appDataResult) DOMUtils.setElementContent(appDataResult, "");

    this.statsManager.updateStats();
  }

  async runSingleTest(testName) {
    const feature = this.features.find(f => f.name === testName);
    if (!feature || isEventDrivenTest(testName)) return;

    try {
      this.updateRow(testName, "running", "Running...");

      const result = await feature.fn();
      const details = ResultFormatter.formatTestResult(result, testName);

      this.updateRow(testName, "success", details);
    } catch (e) {
      const msg = e.message || String(e);
      if (msg === "Not available in this version") {
        this.updateRow(testName, "skipped", msg);
      } else {
        GeneralUtils.logError(`Test ${testName}`, e);
        this.updateRow(testName, "fail", msg);
      }
    }

    this.statsManager.updateStats();
  }

  clearSingleTest(testName) {
    const feature = this.features.find(f => f.name === testName);
    if (!feature) return;

    this.updateRow(testName, "pending", feature.pendingMsg || "");
    this.statsManager.updateStats();
  }

  exportResults() {
    const results = ExportUtils.createResultsExport(this.features);
    const filename = `domo-js-test-results-${new Date().toISOString().split('T')[0]}.json`;
    ExportUtils.downloadJSON(results, filename);
  }

  /* -----------------------------------------------------------------------
     Row/Card Update (syncs both card UI and hidden table row)
     ----------------------------------------------------------------------- */

  updateRow(name, status, details = "") {
    // Toggle dimmed state for skipped tests
    const card = DOMUtils.getElementById(`card-${name}`);
    if (card) {
      card.classList.toggle("test-card--skipped", status === "skipped");
    }

    // Update card
    const statusEl = DOMUtils.getElementById(`status-${name}`);
    if (statusEl) {
      const icon = ResultFormatter.getStatusIcon(status);
      const label = STATUS_LABELS[status] || STATUS_LABELS.pending;
      statusEl.innerHTML = `<span class="status ${status}">${icon} ${label}</span>`;
    }

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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initVersionPicker();
  window.testApp = new DomoTestApp();
  window.testApp.init();
  updateDeviceInfo();
});

function initVersionPicker() {
  const select = DOMUtils.getElementById("versionSelect");
  const badge = DOMUtils.getElementById("versionSource");
  if (!select || !badge) return;

  const chosen = (typeof RYUUJS_CHOSEN !== "undefined") ? RYUUJS_CHOSEN : "local";
  const versions = (typeof RYUUJS_VERSIONS !== "undefined") ? RYUUJS_VERSIONS : [];

  // Local option
  const localOpt = document.createElement("option");
  localOpt.value = "local";
  localOpt.textContent = "Local (dev build)";
  select.appendChild(localOpt);

  versions.forEach(function(v) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });

  select.value = chosen;
  badge.textContent = chosen === "local" ? "local" : "cdn";
  badge.className = "version-picker__badge " +
    (chosen === "local" ? "version-picker__badge--local" : "version-picker__badge--cdn");

  select.addEventListener("change", function() {
    const next = select.value;
    const url = new URL(window.location.href);
    if (next === "local") {
      url.searchParams.delete("v");
    } else {
      url.searchParams.set("v", next);
    }
    window.location.href = url.toString();
  });
}

function updateDeviceInfo() {
  const deviceTypeElement = DOMUtils.getElementById('deviceType');
  if (!deviceTypeElement) return;

  try {
    const isIOSResult = GeneralUtils.isIOS();
    const userAgent = navigator.userAgent;

    let deviceType = 'Unknown';
    let deviceClass = 'non-ios-device';

    if (isIOSResult) {
      if (/iphone/i.test(userAgent)) deviceType = 'iPhone';
      else if (/ipad/i.test(userAgent)) deviceType = 'iPad';
      else if (/ipod/i.test(userAgent)) deviceType = 'iPod';
      else deviceType = 'iOS Device';
      deviceClass = 'ios-device';
    } else {
      if (/android/i.test(userAgent)) deviceType = 'Android';
      else if (/windows/i.test(userAgent)) deviceType = 'Windows';
      else if (/mac/i.test(userAgent)) deviceType = 'Mac';
      else if (/linux/i.test(userAgent)) deviceType = 'Linux';
      else deviceType = 'Desktop';
    }

    deviceTypeElement.textContent = deviceType;
    deviceTypeElement.className = `device-badge ${deviceClass}`;
  } catch (error) {
    deviceTypeElement.textContent = 'Error';
    deviceTypeElement.className = 'device-badge';
    console.error('Device detection error:', error);
  }
}
