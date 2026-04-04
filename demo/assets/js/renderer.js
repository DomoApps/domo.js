/**
 * Rendering utilities for the Domo test app.
 * Migrated from utils.js and extended with RequestRenderer and EventRenderer.
 */

/**
 * DOM Utilities
 */
class DOMUtils {
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

  static querySelector(selector) {
    return document.querySelector(selector);
  }

  static toggleElementVisibility(element, show) {
    element.style.display = show ? 'inline-block' : 'none';
  }

  static setElementContent(element, content, isHTML = false) {
    if (isHTML) {
      element.innerHTML = content;
    } else {
      element.textContent = content;
    }
  }
}

/**
 * General Utilities
 */
class GeneralUtils {
  static logInfo(context, message, data = null) {
    console.log(`${context}:`, message, data || '');
  }

  static logError(context, error) {
    console.error(`Error in ${context}:`, error);
  }

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

  static generateUniqueId() {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
 * Rich data rendering for event payloads and HTTP results
 */
class DataRenderer {
  /**
   * Render an event payload block.
   * @param {string} direction  "sent" | "received"
   * @param {string} method     The method/event name
   * @param {*}      data       Payload (any JSON-serializable value)
   * @param {object} opts       { timing, via, timestamp }
   */
  static renderPayload(direction, method, data, opts = {}) {
    const isSent = direction === "sent";
    const dirClass = isSent ? "data-block--sent" : "data-block--received";
    const arrow = isSent ? "&#x2191;" : "&#x2193;"; // up or down
    const dirLabel = isSent ? "Sent" : "Received";
    const _now = opts.timestamp ? null : new Date();
    const timestamp = opts.timestamp || (_now.getHours().toString().padStart(2,'0') + ':' + _now.getMinutes().toString().padStart(2,'0') + ':' + _now.getSeconds().toString().padStart(2,'0'));
    const via = opts.via ? `<span class="data-block__via">via ${opts.via}</span>` : "";
    const timing = opts.timing ? `<span class="data-block__timing">${opts.timing}</span>` : "";

    const body = this.renderValue(data);

    return `
      <div class="data-block ${dirClass}">
        <div class="data-block__header">
          <span class="data-block__arrow">${arrow}</span>
          <span class="data-block__dir">${dirLabel}</span>
          <code class="data-block__method">${method}</code>
          ${via}
          <span class="data-block__spacer"></span>
          ${timing}
          <span class="data-block__time">${timestamp}</span>
        </div>
        <div class="data-block__body">${body}</div>
      </div>
    `;
  }

  /**
   * Render an HTTP response block.
   */
  static renderHTTPResult(method, url, data, opts = {}) {
    const timing = opts.timing ? `<span class="data-block__timing">${opts.timing}</span>` : "";
    const body = this.renderValue(data);

    return `
      <div class="data-block data-block--http">
        <div class="data-block__header">
          <span class="data-block__http-method">${method}</span>
          <code class="data-block__url">${this.escapeHTML(url)}</code>
          <span class="data-block__spacer"></span>
          ${timing}
        </div>
        <div class="data-block__body">${body}</div>
      </div>
    `;
  }

  /**
   * Render any JS value as syntax-highlighted JSON.
   */
  static renderValue(value) {
    if (value === undefined || value === null) {
      return `<span class="json-null">null</span>`;
    }
    if (typeof value === "string") {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "object" && parsed !== null) {
          return this.highlightJSON(parsed);
        }
      } catch (_) { /* not JSON, render as string */ }
      return `<span class="json-string">"${this.escapeHTML(value)}"</span>`;
    }
    if (typeof value === "object") {
      return this.highlightJSON(value);
    }
    return `<span class="json-number">${String(value)}</span>`;
  }

  /**
   * Syntax-highlight a JSON object/array.
   */
  static highlightJSON(obj, indent = 0) {
    const pad = "  ".repeat(indent);
    const padInner = "  ".repeat(indent + 1);

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '<span class="json-bracket">[]</span>';
      const items = obj.map(item => padInner + this.highlightJSON(item, indent + 1));
      return `<span class="json-bracket">[</span>\n${items.join(',\n')}\n${pad}<span class="json-bracket">]</span>`;
    }

    if (obj === null) return '<span class="json-null">null</span>';

    if (typeof obj !== "object") {
      if (typeof obj === "string") return `<span class="json-string">"${this.escapeHTML(obj)}"</span>`;
      if (typeof obj === "boolean") return `<span class="json-bool">${obj}</span>`;
      return `<span class="json-number">${obj}</span>`;
    }

    const keys = Object.keys(obj);
    if (keys.length === 0) return '<span class="json-bracket">{}</span>';

    const entries = keys.map(key => {
      const val = this.highlightJSON(obj[key], indent + 1);
      return `${padInner}<span class="json-key">"${this.escapeHTML(key)}"</span>: ${val}`;
    });

    return `<span class="json-bracket">{</span>\n${entries.join(',\n')}\n${pad}<span class="json-bracket">}</span>`;
  }

  static escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      // Rich payload rendering
      if (result._render === "payload") {
        return DataRenderer.renderPayload(
          result.direction, result.method, result.payload,
          { timing: result.timing, via: result.via }
        );
      }

      // Rich HTTP rendering
      if (result._render === "http") {
        return DataRenderer.renderHTTPResult(
          result.httpMethod, result.url, result.payload,
          { timing: result.timing }
        );
      }

      // Special formatting for iOS detection test
      if (testName === "ios-detection" && result.data) {
        return this.formatIOSDetectionResult(result);
      }

      // Fallback
      let details = "";
      if (result.data) {
        const dataStr = typeof result.data === "string"
          ? result.data
          : JSON.stringify(result.data).substring(0, 100) + "...";
        details += dataStr;
      }
      if (result.timing) {
        details += `<div class="timing">${result.timing}</div>`;
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
            ${isIOS ? 'iOS Device' : 'Not iOS'}
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
              <li>iOS User Agent: ${indicators.hasIOSUserAgent ? 'Yes' : 'No'}</li>
              <li>iPad Desktop Mode: ${indicators.isPossibleIPadDesktopMode ? 'Yes' : 'No'}</li>
              <li>iOS APIs Available: ${indicators.hasIOSAPIs ? 'Yes' : 'No'}</li>
              <li>Standalone Mode: ${indicators.isStandalone ? 'Yes' : 'No'}</li>
            </ul>
          </div>
        </div>

        ${timing ? `<div class="timing">${timing}</div>` : ''}
      </div>
    `;

    return html;
  }

  static getStatusIcon(status) {
    switch(status) {
      case "success": return "✅";
      case "fail": return "❌";
      case "running": return "🔄";
      case "skipped": return "⊘";
      default: return "⏳";
    }
  }
}

/**
 * Request Builder response renderer.
 * Renders HTTP responses, errors, and history entries for the Request Builder panel.
 */
class RequestRenderer {
  /**
   * Render a full response entry.
   * @param {object} entry - { method, url, status, timing, response, error }
   * @returns {string} HTML string
   */
  static renderResponse(entry) {
    if (entry.error) {
      return this.renderError(entry.error);
    }

    const statusCode = Number(entry.status) || 0;
    const badgeColor = statusCode >= 200 && statusCode < 300
      ? 'var(--accent-green)'
      : statusCode >= 300 && statusCode < 400
        ? 'var(--accent-amber)'
        : 'var(--accent-red)';

    const timingHtml = entry.timing
      ? `<span class="data-block__timing">${DataRenderer.escapeHTML(String(entry.timing))}</span>`
      : '';

    const bodyHtml = DataRenderer.renderHTTPResult(
      DataRenderer.escapeHTML(String(entry.method)),
      DataRenderer.escapeHTML(String(entry.url)),
      entry.response,
      { timing: entry.timing }
    );

    return `
      <div class="data-block data-block--response">
        <div class="data-block__header">
          <span class="data-block__status-badge" style="background:${badgeColor};color:#fff;padding:2px 8px;border-radius:4px;font-weight:600;">
            ${DataRenderer.escapeHTML(String(entry.status))}
          </span>
          ${timingHtml}
        </div>
        <div class="data-block__body">${bodyHtml}</div>
      </div>
    `;
  }

  /**
   * Render an error response.
   * @param {object} error - Error object with name, message, status, body properties.
   * @returns {string} HTML string
   */
  static renderError(error) {
    const errorName = DataRenderer.escapeHTML(String(error.name || 'Error'));
    const errorMessage = DataRenderer.escapeHTML(String(error.message || 'Unknown error'));

    const errorTypeColors = {
      DomoHttpError: 'var(--accent-red)',
      DomoAuthError: 'var(--accent-amber)',
      DomoConnectionError: 'var(--accent-purple)',
      DomoValidationError: 'var(--accent-blue)'
    };
    const badgeColor = errorTypeColors[error.name] || 'var(--accent-red)';

    const statusHtml = error.status != null
      ? `<div class="data-block__error-status" style="color:var(--text-secondary);">Status: <strong>${DataRenderer.escapeHTML(String(error.status))}</strong></div>`
      : '';

    const bodyHtml = error.body != null
      ? `<div class="data-block__error-body"><pre class="data-block__pre">${DataRenderer.renderValue(error.body)}</pre></div>`
      : '';

    return `
      <div class="data-block data-block--error">
        <div class="data-block__header">
          <span class="data-block__error-badge" style="background:${badgeColor};color:#fff;padding:2px 8px;border-radius:4px;font-weight:600;">
            ${errorName}
          </span>
        </div>
        <div class="data-block__body">
          <div class="data-block__error-message" style="color:var(--text-muted);">${errorMessage}</div>
          ${statusHtml}
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  /**
   * Render a compact history entry row.
   * @param {object} entry - { id, method, url, status, timing }
   * @returns {string} HTML string
   */
  static renderHistoryEntry(entry) {
    const methodColors = {
      GET: 'var(--accent-green)',
      POST: 'var(--accent-blue)',
      PUT: 'var(--accent-amber)',
      DELETE: 'var(--accent-red)'
    };

    const method = DataRenderer.escapeHTML(String(entry.method || 'GET'));
    const methodColor = methodColors[entry.method] || 'var(--text-secondary)';

    const maxUrlLength = 40;
    const rawUrl = String(entry.url || '');
    const truncatedUrl = rawUrl.length > maxUrlLength
      ? rawUrl.substring(0, maxUrlLength) + '...'
      : rawUrl;
    const safeUrl = DataRenderer.escapeHTML(truncatedUrl);
    const fullUrl = DataRenderer.escapeHTML(rawUrl);

    const status = entry.status != null
      ? DataRenderer.escapeHTML(String(entry.status))
      : '';

    const statusCode = Number(entry.status) || 0;
    const statusColor = statusCode >= 200 && statusCode < 300
      ? 'var(--accent-green)'
      : statusCode >= 300 && statusCode < 400
        ? 'var(--accent-amber)'
        : statusCode >= 400
          ? 'var(--accent-red)'
          : 'var(--text-muted)';

    const timingHtml = entry.timing
      ? `<span class="history-entry__timing" style="color:var(--text-muted);">${DataRenderer.escapeHTML(String(entry.timing))}</span>`
      : '';

    const entryId = entry.id != null
      ? DataRenderer.escapeHTML(String(entry.id))
      : '';

    return `
      <div class="history-entry" data-id="${entryId}">
        <span class="history-entry__method" style="background:${methodColor};color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;font-size:0.75em;">${method}</span>
        <span class="history-entry__url" style="color:var(--text-secondary);" title="${fullUrl}">${safeUrl}</span>
        <span class="history-entry__status" style="color:${statusColor};font-weight:600;">${status}</span>
        ${timingHtml}
      </div>
    `;
  }
}

/**
 * Event Monitor feed renderer.
 * Renders event entries with expandable payloads for the Event Monitor panel.
 */
class EventRenderer {
  /**
   * Render a full event entry.
   * @param {object} entry - { id, timestamp, direction, eventType, requestId, payload, expanded }
   * @returns {string} HTML string
   */
  static renderEventEntry(entry) {
    const isInbound = entry.direction === 'in';
    const modifierClass = isInbound ? 'event-entry--in' : 'event-entry--out';

    // Format timestamp as HH:MM:SS.mmm
    const ts = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
    const hours = String(ts.getHours()).padStart(2, '0');
    const minutes = String(ts.getMinutes()).padStart(2, '0');
    const seconds = String(ts.getSeconds()).padStart(2, '0');
    const millis = String(ts.getMilliseconds()).padStart(3, '0');
    const formattedTime = `${hours}:${minutes}:${seconds}.${millis}`;

    // Direction arrow: up-purple for out, down-green for in
    const arrowHtml = isInbound
      ? `<span class="event-entry__arrow" style="color:var(--accent-green);">&#x2193;</span>`
      : `<span class="event-entry__arrow" style="color:var(--accent-purple);">&#x2191;</span>`;

    const eventType = DataRenderer.escapeHTML(String(entry.eventType || ''));

    // Truncate requestId for display
    const rawRequestId = String(entry.requestId || '');
    const maxReqIdLength = 12;
    const truncatedRequestId = rawRequestId.length > maxReqIdLength
      ? rawRequestId.substring(0, maxReqIdLength) + '...'
      : rawRequestId;
    const safeRequestId = DataRenderer.escapeHTML(truncatedRequestId);
    const fullRequestId = DataRenderer.escapeHTML(rawRequestId);

    const requestIdHtml = entry.requestId
      ? `<span class="event-entry__request-id" style="color:var(--text-muted);font-size:0.8em;" title="${fullRequestId}">${safeRequestId}</span>`
      : '';

    const payloadHtml = this.renderExpandablePayload(entry.payload, !!entry.expanded);

    const entryId = entry.id != null
      ? DataRenderer.escapeHTML(String(entry.id))
      : '';

    return `
      <div class="event-entry ${modifierClass}" data-id="${entryId}">
        <div class="event-entry__header">
          <span class="event-entry__time" style="color:var(--text-muted);font-family:monospace;font-size:0.85em;">${formattedTime}</span>
          ${arrowHtml}
          <span class="event-entry__type" style="background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:3px;font-weight:600;font-size:0.8em;">${eventType}</span>
          ${requestIdHtml}
        </div>
        ${payloadHtml}
      </div>
    `;
  }

  /**
   * Render an expandable payload section.
   * @param {*} payload - The payload data to render.
   * @param {boolean} expanded - Whether the payload is currently expanded.
   * @returns {string} HTML string
   */
  static renderExpandablePayload(payload, expanded) {
    if (payload === undefined || payload === null) {
      return '';
    }

    if (!expanded) {
      return `
        <div class="event-entry__payload" style="color:var(--text-muted);cursor:pointer;font-size:0.85em;">
          [click to expand]
        </div>
      `;
    }

    const rendered = DataRenderer.highlightJSON(
      typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch (_) { return payload; } })() : payload
    );

    return `
      <div class="event-entry__payload event-entry__payload--expanded">
        <pre class="data-block__pre">${rendered}</pre>
      </div>
    `;
  }
}
