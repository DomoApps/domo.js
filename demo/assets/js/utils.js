/**
 * Utility functions for DOM manipulation, statistics, and general helpers
 */

/**
 * DOM Utilities
 */
class DOMUtils {
  static querySelector(selector) {
    return document.querySelector(selector);
  }

  static querySelectorAll(selector) {
    return document.querySelectorAll(selector);
  }

  static getElementById(id) {
    return document.getElementById(id);
  }

  static createElement(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else {
        element.setAttribute(key, value);
      }
    });

    if (textContent) {
      element.textContent = textContent;
    }

    return element;
  }

  static setElementContent(element, content, isHTML = false) {
    if (isHTML) {
      element.innerHTML = content;
    } else {
      element.textContent = content;
    }
  }

  static toggleElementVisibility(element, show) {
    element.style.display = show ? 'inline-block' : 'none';
  }

  static addEventListeners(elements, event, handler) {
    elements.forEach(element => {
      element.addEventListener(event, handler);
    });
  }
}

/**
 * Statistics Management
 */
class StatisticsManager {
  constructor() {
    this.totalElement = DOMUtils.getElementById("totalTests");
    this.passedElement = DOMUtils.getElementById("passedTests");
    this.failedElement = DOMUtils.getElementById("failedTests");
    this.pendingElement = DOMUtils.getElementById("pendingTests");
  }

  updateStats() {
    const rows = DOMUtils.querySelectorAll("#reportTable tbody tr");
    let total = 0, passed = 0, failed = 0, pending = 0;
    
    rows.forEach(row => {
      total++;
      const statusElement = row.querySelector('.status');
      if (statusElement) {
        if (statusElement.classList.contains('success')) passed++;
        else if (statusElement.classList.contains('fail')) failed++;
        else if (statusElement.classList.contains('pending')) pending++;
      }
    });
    
    this.totalElement.textContent = total;
    this.passedElement.textContent = passed;
    this.failedElement.textContent = failed;
    this.pendingElement.textContent = pending;
  }
}

/**
 * Test Result Formatter
 */
class ResultFormatter {
  static formatTestResult(result, testName) {
    if (typeof result === "string") {
      return result;
    }
    
    if (result && typeof result === "object") {
      // Special formatting for iOS detection test
      if (testName === "ios-detection" && result.data) {
        return this.formatIOSDetectionResult(result);
      }
      
      let details = "";
      
      if (result.data) {
        const dataStr = typeof result.data === "string" 
          ? result.data 
          : JSON.stringify(result.data).substring(0, 100) + "...";
        details += `📦 ${dataStr}`;
      }
      
      if (result.timing) {
        details += `<div class="timing">⏱️ ${result.timing}</div>`;
      }
      
      return details;
    }
    
    return JSON.stringify(result);
  }

  static formatIOSDetectionResult(result) {
    const { data, timing } = result;
    const { isIOS, userAgent, indicators } = data;
    
    let html = `
      <div class="ios-detection-result">
        <div class="ios-status">
          <strong>iOS Detection:</strong> 
          <span class="ios-badge ${isIOS ? 'ios-true' : 'ios-false'}">
            ${isIOS ? '✅ iOS Device' : '❌ Not iOS'}
          </span>
        </div>
        
        <div class="device-info">
          <div class="info-section">
            <strong>Device Information:</strong>
            <ul>
              <li><strong>User Agent:</strong> <code class="user-agent">${userAgent}</code></li>
              <li><strong>Screen:</strong> ${indicators.screenInfo} (${indicators.devicePixelRatio}x pixel ratio)</li>
              <li><strong>Touch Points:</strong> ${indicators.maxTouchPoints}</li>
            </ul>
          </div>
          
          <div class="detection-indicators">
            <strong>Detection Indicators:</strong>
            <ul>
              <li>iOS User Agent: ${indicators.hasIOSUserAgent ? '✅' : '❌'}</li>
              <li>iPad Desktop Mode: ${indicators.isPossibleIPadDesktopMode ? '✅' : '❌'}</li>
              <li>iOS APIs Available: ${indicators.hasIOSAPIs ? '✅' : '❌'}</li>
              <li>Standalone Mode: ${indicators.isStandalone ? '✅' : '❌'}</li>
            </ul>
          </div>
        </div>
        
        ${timing ? `<div class="timing">⏱️ ${timing}</div>` : ''}
      </div>
    `;
    
    return html;
  }

  static getStatusIcon(status) {
    switch(status) {
      case "success": return "✅";
      case "fail": return "❌";
      case "running": return "🔄";
      default: return "⏳";
    }
  }
}

/**
 * Export Utilities
 */
class ExportUtils {
  static createResultsExport(features, domoVersion = "5.1.0-alpha.0") {
    const results = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      domoVersion,
      results: {}
    };
    
    // Collect current test states
    features.forEach(feature => {
      const row = DOMUtils.getElementById(`row-${feature.name}`);
      if (row) {
        const statusElement = row.querySelector('.status');
        const status = statusElement.classList.contains('success') ? 'success' :
                     statusElement.classList.contains('fail') ? 'fail' : 'pending';
        const details = row.children[2].textContent || row.children[2].innerHTML;
        
        results.results[feature.name] = {
          status,
          details,
          category: feature.category || 'unknown',
          description: feature.description || '',
          timestamp: new Date().toISOString()
        };
      }
    });
    
    return results;
  }

  static downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = DOMUtils.createElement('a', { 
      href: url, 
      download: filename 
    });
    
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * General Utilities
 */
class GeneralUtils {
  static generateUniqueId() {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  static formatTimestamp(date = new Date()) {
    return date.toLocaleTimeString();
  }

  static isRunnable(testName, eventFeatures) {
    return !eventFeatures.includes(testName) && testName !== "requestAppDataUpdate";
  }

  static logError(context, error) {
    console.error(`Error in ${context}:`, error);
  }

  static logInfo(context, message, data = null) {
    console.log(`${context}:`, message, data || '');
  }

  /**
   * Detects if the current device is running iOS using reliable detection methods.
   * Uses a multi-factor approach to avoid false positives while removing brittle screen dimension checks.
   * 
   * @returns {boolean} True if the device is running iOS, false otherwise.
   */
  static isIOS() {
    // Early return if not in browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    const userAgent = navigator.userAgent.toLowerCase();
    
    // Primary iOS device detection via user agent
    // Covers iPhone, iPad, iPod touch
    const hasIOSUserAgent = /(?:iphone|ipad|ipod)/.test(userAgent);
    
    // Detect iPad in desktop mode (iOS 13+)
    // iPad in desktop mode reports as macOS but has touch capabilities
    const isPossibleIPadDesktopMode = /mac os x/.test(userAgent) && 
      'ontouchend' in document &&
      navigator.maxTouchPoints > 1;
    
    // For edge cases where user agent might be modified or unreliable,
    // require MULTIPLE iOS-specific indicators to avoid false positives
    const hasIOSAPIs = window.webkit?.messageHandlers !== undefined;
    const isStandalone = navigator.standalone === true;
    const hasMobileScreenRatio = window.screen && 
      window.devicePixelRatio && 
      window.devicePixelRatio >= 2 && 
      (window.screen.width < 1024 || window.screen.height < 1024); // Mobile-like dimensions
    
    // Strong evidence: clear iOS user agent or iPad desktop mode
    if (hasIOSUserAgent || isPossibleIPadDesktopMode) {
      return true;
    }
    
    // Weaker evidence: require multiple indicators to avoid false positives
    // This prevents test environments from being detected as iOS unless they
    // explicitly mock multiple iOS-specific features
    const multipleIndicators = [hasIOSAPIs, isStandalone, hasMobileScreenRatio].filter(Boolean).length;
    return multipleIndicators >= 2;
  }
}