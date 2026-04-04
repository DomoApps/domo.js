/**
 * Request Builder — ad-hoc API explorer for domo.js endpoints.
 * Uses domo.get/post/put/delete directly (goes through interceptor pipeline + auth).
 */
class RequestBuilder {
  constructor(store) {
    this.store = store;
    this._counter = 0;
  }

  mount(container) {
    if (!container) return;
    this._bindElements();
    this._populatePresets();
    this._populateFormats();
    this._bindEvents();
    this._toggleBodyVisibility();
  }

  _bindElements() {
    this.dropdownEl = document.getElementById('presetDropdown');
    this.methodEl = document.getElementById('rbMethod');
    this.urlEl = document.getElementById('rbUrl');
    this.bodyEl = document.getElementById('rbBody');
    this.bodyWrap = document.getElementById('rbBodyWrap');
    this.sendBtn = document.getElementById('rbSend');
    this.formatEl = document.getElementById('rbFormat');
    this.contentTypeEl = document.getElementById('rbContentType');
    this.schemaEl = document.getElementById('rbSchema');
    this.responseEl = document.getElementById('rbResponse');
    this.historyList = document.getElementById('rbHistoryList');
    this.clearHistoryBtn = document.getElementById('rbClearHistory');
    this._dropdownOpen = false;
  }

  _populatePresets() {
    // Presets are rendered dynamically in _renderDropdown
  }

  _populateFormats() {
    if (!this.formatEl) return;
    APP_CONFIG.FORMAT_OPTIONS.forEach(function(fmt) {
      var opt = document.createElement('option');
      opt.value = fmt.value;
      opt.textContent = fmt.label;
      this.formatEl.appendChild(opt);
    }.bind(this));
  }

  _bindEvents() {
    var self = this;
    if (this.sendBtn) this.sendBtn.addEventListener('click', function() { self.sendRequest(); });
    if (this.methodEl) this.methodEl.addEventListener('change', function() {
      self._toggleBodyVisibility();
      if (self._dropdownOpen) self._renderDropdown();
    });
    if (this.urlEl) {
      this.urlEl.addEventListener('focus', function() { self._showDropdown(); });
      this.urlEl.addEventListener('input', function() { self._renderDropdown(); });
      this.urlEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { self._hideDropdown(); self.sendRequest(); }
        if (e.key === 'Escape') self._hideDropdown();
      });
    }
    // Close dropdown when clicking outside
    document.addEventListener('mousedown', function(e) {
      if (!self.dropdownEl || !self.urlEl) return;
      if (!self.dropdownEl.contains(e.target) && e.target !== self.urlEl) {
        self._hideDropdown();
      }
    });
    if (this.clearHistoryBtn) this.clearHistoryBtn.addEventListener('click', function() { self._clearHistory(); });

    this.store.on('requestHistory', function(history) { self._renderHistory(history); });
  }

  _showDropdown() {
    if (!this.dropdownEl) return;
    this._dropdownOpen = true;
    this._renderDropdown();
    this.dropdownEl.style.display = 'block';
  }

  _hideDropdown() {
    if (!this.dropdownEl) return;
    this._dropdownOpen = false;
    this.dropdownEl.style.display = 'none';
  }

  _renderDropdown() {
    if (!this.dropdownEl) return;
    var method = this.methodEl ? this.methodEl.value : '';
    var query = this.urlEl ? this.urlEl.value.toLowerCase().trim() : '';
    var self = this;

    var filtered = APP_CONFIG.ENDPOINT_PRESETS.filter(function(p) {
      if (method && p.method !== method) return false;
      if (query && query.length > 0) {
        return p.label.toLowerCase().indexOf(query) >= 0 || p.url.toLowerCase().indexOf(query) >= 0;
      }
      return true;
    });

    if (filtered.length === 0) {
      this.dropdownEl.innerHTML = '<div class="preset-dropdown__empty">No matching endpoints</div>';
      return;
    }

    var html = '';
    filtered.forEach(function(preset) {
      var idx = APP_CONFIG.ENDPOINT_PRESETS.indexOf(preset);
      html += '<div class="preset-dropdown__item" data-idx="' + idx + '">';
      html += '<div class="preset-dropdown__label">' + DataRenderer.escapeHTML(preset.label) + '</div>';
      html += '<div class="preset-dropdown__url">' + DataRenderer.escapeHTML(preset.url) + '</div>';
      html += '</div>';
    });
    this.dropdownEl.innerHTML = html;

    // Bind clicks
    this.dropdownEl.querySelectorAll('.preset-dropdown__item').forEach(function(item) {
      item.addEventListener('mousedown', function(e) {
        e.preventDefault(); // prevent blur on url input
        var idx = parseInt(item.getAttribute('data-idx'), 10);
        self._applyPreset(idx);
        self._hideDropdown();
      });
    });
  }

  _toggleBodyVisibility() {
    if (!this.bodyWrap || !this.methodEl) return;
    var method = this.methodEl.value;
    if (method === 'GET' || method === 'DELETE') {
      this.bodyWrap.classList.add('request-builder__body-wrap--hidden');
    } else {
      this.bodyWrap.classList.remove('request-builder__body-wrap--hidden');
    }
  }

  _applyPreset(idx) {
    var preset = APP_CONFIG.ENDPOINT_PRESETS[idx];
    if (!preset) return;

    if (this.urlEl) this.urlEl.value = preset.url;
    if (preset.method && this.methodEl) {
      this.methodEl.value = preset.method;
      this._toggleBodyVisibility();
    }
    if (this.bodyEl) this.bodyEl.value = preset.body || '';
    if (this.contentTypeEl) this.contentTypeEl.value = preset.contentType || '';
  }

  async sendRequest() {
    if (!window.domo) return;
    var method = this.methodEl ? this.methodEl.value : 'GET';
    var url = this.urlEl ? this.urlEl.value.trim() : '';
    if (!url) { this.urlEl && this.urlEl.focus(); return; }

    var bodyStr = this.bodyEl ? this.bodyEl.value.trim() : '';
    var format = this.formatEl ? this.formatEl.value : '';
    var contentType = this.contentTypeEl ? this.contentTypeEl.value.trim() : '';
    var schemaStr = this.schemaEl ? this.schemaEl.value.trim() : '';

    var options = {};
    if (format) options.format = format;
    if (contentType) options.contentType = contentType;

    // Parse schema if provided
    if (schemaStr) {
      try {
        var parseFn = new Function('data', 'return (' + schemaStr + ')(data)');
        options.schema = { parse: parseFn };
      } catch (e) {
        this._renderResponseError({ name: 'SchemaParseError', message: 'Invalid schema function: ' + e.message });
        return;
      }
    }

    // Parse body
    var body = null;
    if (bodyStr && (method === 'POST' || method === 'PUT')) {
      if (!contentType || contentType === 'application/json') {
        try { body = JSON.parse(bodyStr); } catch (e) {
          this._renderResponseError({ name: 'JSONParseError', message: 'Invalid JSON body: ' + e.message });
          return;
        }
      } else {
        body = bodyStr;
      }
    }

    // Show loading state
    if (this.sendBtn) { this.sendBtn.disabled = true; this.sendBtn.textContent = 'Sending...'; }

    var entry = {
      id: 'req-' + (++this._counter),
      method: method,
      url: url,
      body: body,
      options: options,
      timestamp: new Date(),
    };

    var startTime = performance.now();
    try {
      var result;
      var fn = method.toLowerCase();
      if (method === 'GET' || method === 'DELETE') {
        result = await domo[fn](url, options);
      } else {
        result = await domo[fn](url, body, options);
      }
      entry.timing = (performance.now() - startTime).toFixed(1) + 'ms';
      entry.response = result;
      entry.status = 200;
    } catch (error) {
      entry.timing = (performance.now() - startTime).toFixed(1) + 'ms';
      entry.error = error;
      entry.status = error.status || 'ERR';
    }

    if (this.sendBtn) { this.sendBtn.disabled = false; this.sendBtn.textContent = 'Send'; }

    this.store.push('requestHistory', entry);
    this._renderResponse(entry);
    this._activeEntryId = entry.id;
    this._renderHistory(this.store.get('requestHistory'));
  }

  _renderResponse(entry) {
    if (!this.responseEl) return;

    if (entry.error) {
      this._renderResponseError(entry.error, entry);
      return;
    }

    var html = '<div class="data-block data-block--http">';
    html += '<div class="data-block__header">';
    html += '<span class="response-status response-status--ok">200 OK</span>';
    html += '<span class="data-block__timing">' + DataRenderer.escapeHTML(entry.timing || '') + '</span>';
    html += '</div>';
    html += '<div class="data-block__body">';
    html += DataRenderer.renderValue(entry.response);
    html += '</div></div>';
    this.responseEl.innerHTML = html;
  }

  _renderResponseError(error, entry) {
    if (!this.responseEl) return;

    var html = '<div class="data-block data-block--error">';
    html += '<div class="data-block__header" style="background: rgba(239,68,68,0.08); border-bottom: 1px solid rgba(239,68,68,0.12);">';
    html += '<span class="error-type-badge">' + DataRenderer.escapeHTML(error.name || 'Error') + '</span>';
    if (error.status) html += '<span class="response-status response-status--error">' + error.status + '</span>';
    if (entry && entry.timing) html += '<span class="data-block__timing">' + DataRenderer.escapeHTML(entry.timing) + '</span>';
    html += '</div>';
    html += '<div class="data-block__body">';
    html += '<div class="error-props">';
    html += '<span class="error-props__key">message</span><span class="error-props__val">' + DataRenderer.escapeHTML(error.message || '') + '</span>';
    if (error.status) html += '<span class="error-props__key">status</span><span class="error-props__val">' + error.status + ' ' + DataRenderer.escapeHTML(error.statusText || '') + '</span>';
    if (error.body) html += '<span class="error-props__key">body</span><span class="error-props__val">' + DataRenderer.escapeHTML(typeof error.body === 'string' ? error.body.substring(0, 500) : JSON.stringify(error.body)) + '</span>';
    if (error.errors && error.errors.length) html += '<span class="error-props__key">errors</span><span class="error-props__val">' + DataRenderer.escapeHTML(JSON.stringify(error.errors, null, 2)) + '</span>';
    html += '</div></div></div>';
    this.responseEl.innerHTML = html;
  }

  _renderHistory(history) {
    if (!this.historyList) return;
    if (!history || history.length === 0) {
      this.historyList.innerHTML = '<div class="request-builder__empty-history">No requests yet</div>';
      return;
    }

    var self = this;
    var html = '';
    for (var i = history.length - 1; i >= 0; i--) {
      var e = history[i];
      var isError = !!e.error;
      var isActive = e.id === self._activeEntryId;
      var methodClass = 'history-entry__method--' + e.method.toLowerCase();
      html += '<div class="history-entry' + (isError ? ' history-entry--error' : '') + (isActive ? ' history-entry--active' : '') + '" data-id="' + e.id + '">';
      html += '<span class="history-entry__method ' + methodClass + '">' + e.method + '</span>';
      html += '<span class="history-entry__url">' + DataRenderer.escapeHTML(e.url) + '</span>';
      html += '<span class="history-entry__timing">' + DataRenderer.escapeHTML(e.timing || '') + '</span>';
      html += '</div>';
    }
    this.historyList.innerHTML = html;

    // Bind click handlers
    var entries = this.historyList.querySelectorAll('.history-entry');
    entries.forEach(function(el) {
      el.addEventListener('click', function() {
        var id = el.getAttribute('data-id');
        self.replayEntry(id);
      });
    });
  }

  replayEntry(entryId) {
    var history = this.store.get('requestHistory') || [];
    var entry = history.find(function(e) { return e.id === entryId; });
    if (!entry) return;

    // Populate form
    if (this.methodEl) this.methodEl.value = entry.method;
    if (this.urlEl) this.urlEl.value = entry.url;
    if (this.bodyEl) this.bodyEl.value = entry.body ? JSON.stringify(entry.body, null, 2) : '';
    this._toggleBodyVisibility();

    // Show response
    this._activeEntryId = entryId;
    this._renderResponse(entry);
    this._renderHistory(history);
  }

  _clearHistory() {
    this.store.clear('requestHistory');
    this._activeEntryId = null;
    if (this.responseEl) {
      this.responseEl.innerHTML = '<div class="request-builder__empty"><span class="request-builder__empty-icon">/</span><span>Send a request to see the response</span></div>';
    }
  }
}
