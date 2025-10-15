/**
 * Main application logic for domo.js test suite
 * Handles test execution, UI management, and event coordination
 */

class DomoTestApp {
  constructor() {
    this.features = features;
    this.statsManager = new StatisticsManager();
    this.isInitialized = false;
    
    // Bind methods to maintain context
    this.runAllTests = this.runAllTests.bind(this);
    this.clearAllResults = this.clearAllResults.bind(this);
    this.exportResults = this.exportResults.bind(this);
  }

  /**
   * Initialize the application
   */
  init() {
    if (this.isInitialized) return;
    
    // Check if domo.js is available
    if (!window.domo) {
      console.error("domo.js is not loaded.");
      document.body.innerHTML = "<h2>Error: domo.js is not loaded.</h2>";
      return;
    }

    this.buildInitialRows();
    this.registerEventListeners();
    this.setupUIEventListeners();
    
    this.isInitialized = true;
    GeneralUtils.logInfo("DomoTestApp", "Application initialized successfully");
  }

  /**
   * Build the initial test rows in the table
   */
  buildInitialRows() {
    const tbody = DOMUtils.querySelector("#reportTable tbody");
    if (!tbody) {
      GeneralUtils.logError("buildInitialRows", "Table body not found");
      return;
    }

    this.features.forEach(({ name, pendingMsg, customButton, category, description }) => {
      const tr = DOMUtils.createElement("tr", { id: `row-${name}` });
      
      // Determine actions based on test type
      const isEventTest = isEventDrivenTest(name);
      let actionsHtml = "";
      
      if (isEventTest) {
        actionsHtml = `<span style="color: #6b7280; font-size: 0.75rem;">Event-driven</span>`;
      } else {
        actionsHtml = `
          <button class="btn btn-small" onclick="window.testApp.runSingleTest('${name}')">▶️ Run</button>
          <button class="btn btn-small btn-secondary" onclick="window.testApp.clearSingleTest('${name}')">🧹 Clear</button>
        `;
      }
      
      tr.innerHTML = `
        <td>
          <div class="feature-name">${name}</div>
          <div style="font-size: 0.7rem; color: #6b7280; margin-top: 0.25rem;">${description || ''}</div>
        </td>
        <td><span class="status pending">⏳ ${STATUS_LABELS.pending}</span></td>
        <td class="details">${pendingMsg || ""}</td>
        <td class="test-actions">${actionsHtml}</td>
      `;
      
      tbody.appendChild(tr);
      
      if (customButton) {
        this.setupRequestAppDataUpdate();
      }
    });
    
    this.statsManager.updateStats();
  }

  /**
   * Register domo.js event callbacks
   */
  registerEventListeners() {
    EVENT_FEATURES.forEach((eventName) => {
      try {
        GeneralUtils.logInfo("registerEventListeners", `Registering event: ${eventName}`);
        
        window.domo[eventName]((arg) => {
          GeneralUtils.logInfo("Event", `${eventName} triggered`, arg);
          const timestamp = GeneralUtils.formatTimestamp();
          
          let msg;
          switch(eventName) {
            case "onDataUpdated":
              msg = `Callback ran at ${timestamp} with alias: ${arg}`;
              break;
            case "onAppDataUpdated":
              msg = `Callback ran at ${timestamp}. Data: ${arg}`;
              break;
            default:
              msg = `Callback ran successfully at ${timestamp}`;
          }
          
          this.updateRow(eventName, "success", msg);
        });
      } catch (e) {
        GeneralUtils.logError(`registerEventListeners - ${eventName}`, e);
        this.updateRow(eventName, "fail", e.message);
      }
    });
  }

  /**
   * Setup UI event listeners for buttons
   */
  setupUIEventListeners() {
    const runButton = DOMUtils.getElementById("runTests");
    const clearButton = DOMUtils.getElementById("clearResults");
    const exportButton = DOMUtils.getElementById("exportResults");

    if (runButton) runButton.addEventListener("click", this.runAllTests);
    if (clearButton) clearButton.addEventListener("click", this.clearAllResults);
    if (exportButton) exportButton.addEventListener("click", this.exportResults);
  }

  /**
   * Setup the Send App Data button
   */
  setupRequestAppDataUpdate() {
    const row = DOMUtils.getElementById("row-requestAppDataUpdate");
    if (!row) return;
    
    const cell = row.children[2];
    if (cell.querySelector("#requestAppDataUpdateBtn")) return;

    const btn = DOMUtils.createElement("button", {
      id: "requestAppDataUpdateBtn",
      className: "btn btn-small"
    }, "📤 Send App Data");
    
    const resultSpan = DOMUtils.createElement("span", {
      id: "requestAppDataUpdateResult",
      style: "margin-left: 0.5rem;"
    });

    btn.addEventListener("click", async () => {
      try {
        const feature = this.features.find((f) => f.name === "requestAppDataUpdate");
        await feature.fn();
        resultSpan.textContent = "✅ Sent!";
        resultSpan.style.color = "#059669";
      } catch (e) {
        resultSpan.textContent = `❌ Failed: ${e?.message || e}`;
        resultSpan.style.color = "#dc2626";
      }
    });

    cell.append(btn, resultSpan);
  }

  /**
   * Run all automated tests sequentially
   */
  async runAllTests() {
    const runButton = DOMUtils.getElementById("runTests");
    const spinner = DOMUtils.getElementById("spinner");
    const runTestsText = DOMUtils.getElementById("runTestsText");
    
    if (!runButton || !spinner || !runTestsText) return;
    
    // Update UI to running state
    runButton.disabled = true;
    DOMUtils.toggleElementVisibility(spinner, true);
    DOMUtils.setElementContent(runTestsText, "Running Tests...");

    // Reset non-event tests
    for (const { name } of this.features) {
      if (isEventDrivenTest(name)) continue;
      this.updateRow(name, "pending", ""); 
    }

    // Run tests sequentially
    for (const feat of this.features) {
      const { name, fn } = feat;
      if (isEventDrivenTest(name)) continue;
      
      try {
        this.updateRow(name, "running", "Test in progress...");
        
        const result = await fn();
        const details = ResultFormatter.formatTestResult(result, name);
        
        this.updateRow(name, "success", details);
        
      } catch (e) {
        GeneralUtils.logError(`Test ${name}`, e);
        this.updateRow(name, "fail", e.message || String(e));
      }
    }

    // Reset UI to normal state
    runButton.disabled = false;
    DOMUtils.toggleElementVisibility(spinner, false);
    DOMUtils.setElementContent(runTestsText, "🚀 Run All Tests");
    this.statsManager.updateStats();
  }

  /**
   * Clear all test results to initial state
   */
  clearAllResults() {
    // Reset all test rows to their initial state
    this.features.forEach(({ name, pendingMsg }) => {
      const row = DOMUtils.getElementById(`row-${name}`);
      if (row) {
        // Reset status to pending
        const statusCell = row.children[1];
        DOMUtils.setElementContent(statusCell, 
          `<span class="status pending">⏳ ${STATUS_LABELS.pending}</span>`, true);
        
        // Reset details to original pending message (for non-event tests)
        if (!isEventDrivenTest(name)) {
          const detailsCell = row.children[2];
          DOMUtils.setElementContent(detailsCell, pendingMsg || "", true);
        }
      }
    });
    
    // Reset global variables
    resetTestData();
    
    // Clear any app data update result
    const appDataResult = DOMUtils.getElementById("requestAppDataUpdateResult");
    if (appDataResult) {
      DOMUtils.setElementContent(appDataResult, "");
    }
    
    this.statsManager.updateStats();
  }

  /**
   * Run a single test
   */
  async runSingleTest(testName) {
    const feature = this.features.find(f => f.name === testName);
    if (!feature) {
      GeneralUtils.logError("runSingleTest", `Test ${testName} not found`);
      return;
    }
    
    if (isEventDrivenTest(testName)) {
      return; // These tests can't be run individually
    }
    
    try {
      this.updateRow(testName, "running", "Test in progress...");
      
      const result = await feature.fn();
      const details = ResultFormatter.formatTestResult(result, testName);
      
      this.updateRow(testName, "success", details);
      
    } catch (e) {
      GeneralUtils.logError(`Test ${testName}`, e);
      this.updateRow(testName, "fail", e.message || String(e));
    }
    
    this.statsManager.updateStats();
  }

  /**
   * Clear a single test result
   */
  clearSingleTest(testName) {
    const feature = this.features.find(f => f.name === testName);
    if (!feature) return;
    
    const row = DOMUtils.getElementById(`row-${testName}`);
    if (row) {
      // Reset to pending state with original message
      const statusCell = row.children[1];
      DOMUtils.setElementContent(statusCell, 
        `<span class="status pending">⏳ ${STATUS_LABELS.pending}</span>`, true);
      
      const detailsCell = row.children[2];
      DOMUtils.setElementContent(detailsCell, feature.pendingMsg || "", true);
    }
    
    this.statsManager.updateStats();
  }

  /**
   * Export test results
   */
  exportResults() {
    const results = ExportUtils.createResultsExport(this.features);
    const filename = `domo-js-test-results-${new Date().toISOString().split('T')[0]}.json`;
    ExportUtils.downloadJSON(results, filename);
  }

  /**
   * Update a test row with new status and details
   */
  updateRow(name, status, details = "") {
    const row = DOMUtils.getElementById(`row-${name}`);
    if (!row) return;
    
    // Update status with proper styling
    const statusIcon = ResultFormatter.getStatusIcon(status);
    const statusCell = row.children[1];
    DOMUtils.setElementContent(statusCell, 
      `<span class="status ${status}">${statusIcon} ${STATUS_LABELS[status] || STATUS_LABELS.pending}</span>`, 
      true
    );
    
    // Don't overwrite details for event-driven features
    if (!isEventDrivenTest(name)) {
      const detailsCell = row.children[2];
      DOMUtils.setElementContent(detailsCell, details, true);
    }
  }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.testApp = new DomoTestApp();
  window.testApp.init();
  
  // Initialize device detection in header
  updateDeviceInfo();
});

/**
 * Update the device information in the header
 */
function updateDeviceInfo() {
  const deviceTypeElement = DOMUtils.getElementById('deviceType');
  if (!deviceTypeElement) return;
  
  try {
    const isIOSResult = GeneralUtils.isIOS();
    const userAgent = navigator.userAgent;
    
    // Determine device type based on user agent and iOS detection
    let deviceType = 'Unknown Device';
    let deviceClass = 'non-ios-device';
    
    if (isIOSResult) {
      if (/iphone/i.test(userAgent)) {
        deviceType = '📱 iPhone';
      } else if (/ipad/i.test(userAgent)) {
        deviceType = '📱 iPad';
      } else if (/ipod/i.test(userAgent)) {
        deviceType = '📱 iPod Touch';
      } else {
        deviceType = '📱 iOS Device';
      }
      deviceClass = 'ios-device';
    } else {
      // Non-iOS device detection
      if (/android/i.test(userAgent)) {
        deviceType = '🤖 Android Device';
      } else if (/windows/i.test(userAgent)) {
        deviceType = '🖥️ Windows Device';
      } else if (/mac/i.test(userAgent)) {
        deviceType = '🖥️ Mac Device';
      } else if (/linux/i.test(userAgent)) {
        deviceType = '🐧 Linux Device';
      } else {
        deviceType = '🖥️ Desktop Device';
      }
    }
    
    deviceTypeElement.textContent = deviceType;
    deviceTypeElement.className = `device-badge ${deviceClass}`;
    
    console.log("iOS detection result:", isIOSResult);
    console.log("Device type:", deviceType);
    
  } catch (error) {
    deviceTypeElement.textContent = 'Detection Error';
    deviceTypeElement.className = 'device-badge';
    console.error('Device detection error:', error);
  }
}

console.log("iOS detection result:", GeneralUtils.isIOS());