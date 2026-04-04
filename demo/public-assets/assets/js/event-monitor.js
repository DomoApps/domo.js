/**
 * Event Monitor — real-time feed of all MessageChannel and postMessage traffic.
 * Hooks into Domo.debug to capture SDK-level events.
 */
class EventMonitor {
  constructor(store) {
    this.store = store;
    this._counter = 0;
    this._monitoring = false;
    this._originalDebugLog = null;
    this._messageListener = null;
    this._seenIds = new Map(); // requestId -> timestamp for dedup
    this._subscriptions = {}; // { eventName: unsubscribeFn }
  }

  mount(container) {
    if (!container) return;
    this._bindElements();
    this._buildFilterCheckboxes();
    this._buildListenerControls();
    this._bindEvents();
  }

  _bindElements() {
    this.filtersEl = document.getElementById('emFilters');
    this.feedEl = document.getElementById('emFeed');
    this.clearBtn = document.getElementById('emClear');
    this.autoScrollEl = document.getElementById('emAutoScroll');
    this.statusEl = document.getElementById('emStatus');
    this.listenersEl = document.getElementById('emListeners');
  }

  _buildFilterCheckboxes() {
    if (!this.filtersEl) return;
    var self = this;
    var filters = this.store.get('eventFilters');
    this.filtersEl.innerHTML = '';

    APP_CONFIG.EVENT_TYPES.forEach(function(type) {
      var label = document.createElement('label');
      label.className = 'event-monitor__filter-label';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = filters[type] !== false;
      checkbox.addEventListener('change', function() {
        var current = self.store.get('eventFilters');
        current[type] = checkbox.checked;
        self.store.set('eventFilters', current);
        self._renderFeed(self.store.get('eventLog'));
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(type));
      self.filtersEl.appendChild(label);
    });
  }

  _buildListenerControls() {
    if (!this.listenersEl) return;
    var self = this;
    var events = [
      { name: 'onFiltersUpdated', label: 'Filters' },
      { name: 'onDataUpdated', label: 'Data' },
      { name: 'onVariablesUpdated', label: 'Variables' },
      { name: 'onAppDataUpdated', label: 'App Data' },
    ];

    var html = '<div class="event-monitor__listener-row">';
    html += '<span class="event-monitor__listener-title">Listeners</span>';
    events.forEach(function(evt) {
      html += '<button class="btn btn-small event-monitor__sub-btn" data-event="' + evt.name + '">';
      html += '<span class="event-monitor__sub-dot" data-dot="' + evt.name + '"></span>';
      html += evt.label;
      html += '</button>';
    });
    html += '</div>';
    this.listenersEl.innerHTML = html;

    // Bind buttons
    this.listenersEl.querySelectorAll('.event-monitor__sub-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var evtName = btn.getAttribute('data-event');
        self._toggleSubscription(evtName);
      });
    });
    this._updateListenerDots();
  }

  _toggleSubscription(eventName) {
    var self = this;
    if (this._subscriptions[eventName]) {
      // Unsubscribe
      this._subscriptions[eventName]();
      delete this._subscriptions[eventName];
      this._captureEvent({
        direction: 'out',
        eventType: 'unsubscribe',
        requestId: null,
        payload: { event: eventName, action: 'unsubscribed' },
      });
    } else {
      // Subscribe — need noop seed trick for onFiltersUpdated
      if (eventName === 'onFiltersUpdated' && window.domo.listeners) {
        var key = resolveListenerKey ? resolveListenerKey('onFiltersUpdated') : 'onFiltersUpdated';
        if (key && window.domo.listeners[key]) {
          var noop = function() {};
          window.domo.listeners[key].push(noop);
          // Remove after connect fires
          setTimeout(function() {
            var idx = window.domo.listeners[key].indexOf(noop);
            if (idx >= 0) window.domo.listeners[key].splice(idx, 1);
          }, 100);
        }
      }

      var methodName = resolveEventMethod ? resolveEventMethod(eventName) : eventName;
      if (!methodName || typeof window.domo[methodName] !== 'function') {
        this._captureEvent({
          direction: 'out',
          eventType: 'error',
          requestId: null,
          payload: { event: eventName, error: 'Not available in this version' },
        });
        return;
      }

      // Subscribe but don't capture here — the debug.log hook or message listener
      // already captures the event. This subscription just keeps the listener active.
      var unsub = window.domo[methodName](function(data) {
        // Intentionally empty — event captured via debug.log or message listener
      });
      this._subscriptions[eventName] = unsub;
      this._captureEvent({
        direction: 'out',
        eventType: 'subscribe',
        requestId: null,
        payload: { event: eventName, action: 'subscribed', via: methodName },
      });
    }
    this._updateListenerDots();
  }

  _updateListenerDots() {
    if (!this.listenersEl) return;
    var self = this;
    this.listenersEl.querySelectorAll('.event-monitor__sub-dot').forEach(function(dot) {
      var evtName = dot.getAttribute('data-dot');
      var active = !!self._subscriptions[evtName];
      dot.classList.toggle('event-monitor__sub-dot--active', active);
    });
    // Also update the button text/style
    this.listenersEl.querySelectorAll('.event-monitor__sub-btn').forEach(function(btn) {
      var evtName = btn.getAttribute('data-event');
      var active = !!self._subscriptions[evtName];
      btn.classList.toggle('event-monitor__sub-btn--active', active);
    });
  }

  _bindEvents() {
    var self = this;
    if (this.clearBtn) this.clearBtn.addEventListener('click', function() { self.clearLog(); });
    if (this.autoScrollEl) {
      this.autoScrollEl.addEventListener('change', function() {
        self.store.set('autoScroll', self.autoScrollEl.checked);
      });
    }
    this.store.on('eventLog', function(log) { self._renderFeed(log); });
  }

  startMonitoring() {
    if (this._monitoring) return;
    this._monitoring = true;

    var self = this;

    // Hook into domo.debug if available
    if (window.domo && window.domo.debug) {
      window.domo.debug.enable(['all']);
      this.store.set('debugEnabled', true);

      this._originalDebugLog = window.domo.debug.log;
      window.domo.debug.log = function(category) {
        var args = Array.prototype.slice.call(arguments, 1);
        // Call original
        if (self._originalDebugLog) self._originalDebugLog.apply(window.domo.debug, arguments);
        // Capture
        self._captureDebugEvent(category, args);
      };
    }

    // Raw window message listener — only used as fallback when debug is unavailable,
    // or for events the SDK doesn't route through debug (navigate, etc.)
    var hasDebug = !!(window.domo && window.domo.debug && window.domo.debug.enabled);
    // Events that debug.log already captures — skip these in the raw listener
    var debugCapturedEvents = ['filtersUpdated', 'variablesUpdated', 'dataUpdated', 'appData', 'ack'];

    this._messageListener = function(event) {
      var data;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) { return; }
      if (!data || typeof data !== 'object') return;
      if (!data.event) return;

      // If debug is active, skip events it already captures
      if (hasDebug && debugCapturedEvents.indexOf(data.event) >= 0) return;

      self._captureEvent({
        direction: 'in',
        eventType: data.event,
        requestId: data.requestId || null,
        payload: data,
      });
    };
    window.addEventListener('message', this._messageListener);

    this._updateStatus();
  }

  stopMonitoring() {
    if (!this._monitoring) return;
    this._monitoring = false;

    // Restore debug.log
    if (this._originalDebugLog && window.domo && window.domo.debug) {
      window.domo.debug.log = this._originalDebugLog;
      this._originalDebugLog = null;
    }

    // Remove message listener
    if (this._messageListener) {
      window.removeEventListener('message', this._messageListener);
      this._messageListener = null;
    }
  }

  _captureDebugEvent(category, args) {
    // 'messages' category with 'received:channel' or 'received:postMessage' prefix
    // This is the single canonical source for incoming events.
    if (category === 'messages' && typeof args[0] === 'string' && args[0].indexOf('received:') === 0) {
      var source = args[0] === 'received:channel' ? 'MessageChannel' : 'postMessage';
      var eventType = args[1] || 'unknown';
      var payload = args.length > 2 ? args[2] : args[1];
      var requestId = (payload && typeof payload === 'object') ? payload.requestId : null;
      this._captureEvent({ direction: 'in', eventType: eventType, requestId: requestId, payload: payload, source: source });
      return;
    }

    // 'messages' category with other prefixes = outgoing (subscribe, etc.)
    if (category === 'messages' && args[0] !== 'received') {
      this._captureEvent({
        direction: 'out',
        eventType: 'messages',
        requestId: null,
        payload: { detail: args.join(' ') },
      });
      return;
    }

    // 'http' category = HTTP request/response
    if (category === 'http') {
      this._captureEvent({
        direction: 'out',
        eventType: 'http',
        requestId: null,
        payload: { detail: args.join(' ') },
      });
      return;
    }

    // Skip 'filters' and 'variables' categories — these are handler-level logs
    // that duplicate the 'messages' category 'received' event above.
  }

  _captureEvent(eventData) {
    var entry = {
      id: 'evt-' + (++this._counter),
      timestamp: new Date(),
      direction: eventData.direction || 'in',
      eventType: eventData.eventType || 'unknown',
      requestId: eventData.requestId || null,
      payload: eventData.payload,
      source: eventData.source || null,
      expanded: false,
    };

    this.store.push('eventLog', entry);

    // Clean up old dedup entries
    if (this._seenIds.size > 100) {
      var now = Date.now();
      this._seenIds.forEach(function(ts, key) {
        if (now - ts > 5000) this._seenIds.delete(key);
      }.bind(this));
    }
  }

  _renderFeed(log) {
    if (!this.feedEl) return;
    if (!log || log.length === 0) {
      this.feedEl.innerHTML = '<div class="event-monitor__empty"><span class="event-monitor__empty-icon">~</span><span>Waiting for events...</span><span class="event-monitor__empty-hint">Interact with filters/variables on the page, or register event listeners in the Test Suite</span></div>';
      return;
    }

    var filters = this.store.get('eventFilters');
    var html = '';
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      // Apply filter
      if (filters[entry.eventType] === false) continue;

      var dirClass = entry.direction === 'in' ? 'event-entry--in' : 'event-entry--out';
      var arrowClass = entry.direction === 'in' ? 'event-entry__arrow--in' : 'event-entry__arrow--out';
      var arrow = entry.direction === 'in' ? '\u2193' : '\u2191';
      var time = this._formatTime(entry.timestamp);
      var idStr = entry.requestId ? entry.requestId.substring(0, 20) + (entry.requestId.length > 20 ? '...' : '') : '';

      html += '<div class="event-entry ' + dirClass + '" data-id="' + entry.id + '">';
      html += '<div class="event-entry__row">';
      html += '<span class="event-entry__time">' + time + '</span>';
      html += '<span class="event-entry__arrow ' + arrowClass + '">' + arrow + '</span>';
      html += '<span class="event-entry__type">' + DataRenderer.escapeHTML(entry.eventType) + '</span>';
      if (entry.source) html += '<span class="event-entry__source event-entry__source--' + (entry.source === 'MessageChannel' ? 'channel' : 'post') + '">' + DataRenderer.escapeHTML(entry.source) + '</span>';
      if (idStr) html += '<span class="event-entry__id">' + DataRenderer.escapeHTML(idStr) + '</span>';
      html += '<span class="event-entry__expand-hint">' + (entry.expanded ? '\u25B2' : '\u25BC') + '</span>';
      html += '</div>';

      if (entry.expanded) {
        html += '<div class="event-entry__payload">';
        html += DataRenderer.renderValue(entry.payload);
        html += '</div>';
      }
      html += '</div>';
    }
    this.feedEl.innerHTML = html;

    // Bind expand/collapse
    var self = this;
    this.feedEl.querySelectorAll('.event-entry__row').forEach(function(row) {
      row.addEventListener('click', function() {
        var entryEl = row.closest('.event-entry');
        var id = entryEl.getAttribute('data-id');
        self._toggleEntry(id);
      });
    });

    // Auto-scroll
    if (this.store.get('autoScroll') && this.feedEl.lastElementChild) {
      this.feedEl.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  _toggleEntry(entryId) {
    var log = this.store.get('eventLog');
    var entry = log.find(function(e) { return e.id === entryId; });
    if (entry) {
      entry.expanded = !entry.expanded;
      this._renderFeed(log);
    }
  }

  clearLog() {
    this.store.clear('eventLog');
  }

  _formatTime(date) {
    if (!(date instanceof Date)) date = new Date(date);
    var h = String(date.getHours()).padStart(2, '0');
    var m = String(date.getMinutes()).padStart(2, '0');
    var s = String(date.getSeconds()).padStart(2, '0');
    var ms = String(date.getMilliseconds()).padStart(3, '0');
    return h + ':' + m + ':' + s + '.' + ms;
  }

  _updateStatus() {
    if (!this.statusEl) return;
    var parts = [];
    if (window.domo && window.domo.debug && window.domo.debug.enabled) {
      parts.push('Debug: ON');
    } else {
      parts.push('Debug: OFF (older SDK version or not enabled)');
    }
    if (window.domo && window.domo.connected) {
      parts.push('Connected');
    }
    this.statusEl.textContent = parts.join(' | ');
  }
}
