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
  static formatTestResult(result) {
    if (typeof result === "string") {
      return result;
    }
    
    if (result && typeof result === "object") {
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
}