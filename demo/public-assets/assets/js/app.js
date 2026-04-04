/**
 * Main application — tab management, version picker, environment panel, initialization.
 */
class DomoApp {
  constructor() {
    this.store = appStore;
    this.requestBuilder = new RequestBuilder(this.store);
    this.eventMonitor = new EventMonitor(this.store);
    this.testSuite = new TestSuite(this.store);
  }

  init() {
    if (!window.domo) {
      document.body.innerHTML = '<h2 style="color:#ef4444;text-align:center;padding:4rem">Error: domo.js is not loaded.</h2>';
      return;
    }

    initVersionPicker();
    this._initTabs();
    this._initEnvPanel();

    // Mount tab contents
    this.requestBuilder.mount(document.getElementById('tab-content-request'));
    this.eventMonitor.mount(document.getElementById('tab-content-monitor'));
    this.testSuite.mount(document.getElementById('tab-content-tests'));

    // Wire up test suite UI controls
    this._wireTestSuiteControls();

    // Read initial tab from hash
    var hash = window.location.hash.replace('#', '') || 'tests';
    this.switchTab(hash);

    // Listen for hash changes
    var self = this;
    window.addEventListener('hashchange', function() {
      var tab = window.location.hash.replace('#', '') || 'tests';
      self.switchTab(tab);
    });

    updateDeviceInfo();
  }

  switchTab(tabId) {
    var validIds = APP_CONFIG.TABS.map(function(t) { return t.id; });
    if (validIds.indexOf(tabId) === -1) tabId = 'request';

    this.store.set('activeTab', tabId);

    // Toggle visibility
    validIds.forEach(function(id) {
      var content = document.getElementById('tab-content-' + id);
      var btn = document.getElementById('tab-btn-' + id);
      if (content) content.style.display = id === tabId ? '' : 'none';
      if (btn) btn.classList.toggle('tab-btn--active', id === tabId);
    });

    // Update hash without scrolling
    history.replaceState(null, '', '#' + tabId);

    // Start monitoring when switching to monitor tab
    if (tabId === 'monitor') {
      this.eventMonitor.startMonitoring();
    }
  }

  _wireTestSuiteControls() {
    var self = this;
    var bannerBtn = document.getElementById('bannerRegisterBtn');
    if (bannerBtn) bannerBtn.addEventListener('click', function() { self.testSuite.registerEventListeners(); });

    var runBtn = document.getElementById('runTests');
    if (runBtn) runBtn.addEventListener('click', function() {
      var spinner = document.getElementById('spinner');
      var text = document.getElementById('runTestsText');
      if (spinner) spinner.style.display = '';
      if (text) text.textContent = 'Running...';
      if (runBtn) runBtn.disabled = true;
      self.testSuite.runAll().then(function() {
        if (spinner) spinner.style.display = 'none';
        if (text) text.textContent = 'Run All Tests';
        if (runBtn) runBtn.disabled = false;
      });
    });

    var clearBtn = document.getElementById('clearResults');
    if (clearBtn) clearBtn.addEventListener('click', function() { self.testSuite.clearAll(); });

    var exportBtn = document.getElementById('exportResults');
    if (exportBtn) exportBtn.addEventListener('click', function() { self.testSuite.exportResults(); });
  }

  _initTabs() {
    var nav = document.getElementById('tabNav');
    if (!nav) return;
    var self = this;

    APP_CONFIG.TABS.forEach(function(tab) {
      var btn = document.createElement('button');
      btn.id = 'tab-btn-' + tab.id;
      btn.className = 'tab-btn';
      btn.textContent = tab.label;
      btn.addEventListener('click', function() { self.switchTab(tab.id); });
      nav.appendChild(btn);
    });
  }

  _initEnvPanel() {
    var body = document.getElementById('envPanelBody');
    if (!body) return;

    var self = this;
    var render = function() {
      var env = window.domo.env || {};
      var debugOn = window.domo.debug ? window.domo.debug.enabled : false;
      var rows = [
        ['User', env.userName || 'N/A'],
        ['Email', env.userEmail || 'N/A'],
        ['Customer', env.customer || 'N/A'],
        ['Host', env.host || '(loading...)'],
        ['Platform', env.platform || 'N/A'],
        ['Locale', env.locale || 'N/A'],
        ['Page ID', env.pageId || 'N/A'],
        ['Debug', debugOn ? 'ON' : 'OFF'],
        ['Version', typeof RYUUJS_CHOSEN !== 'undefined' ? RYUUJS_CHOSEN : 'unknown'],
      ];

      body.innerHTML = rows.map(function(r) {
        return '<div class="env-panel__row"><span>' + DataRenderer.escapeHTML(r[0]) + '</span><code>' + DataRenderer.escapeHTML(String(r[1])) + '</code></div>';
      }).join('');
    };

    render();
    this.store.on('debugEnabled', render);

    // Re-render after env finishes loading
    setTimeout(render, 3000);
  }
}

/* -----------------------------------------------------------------------
   Version Picker (unchanged from original)
   ----------------------------------------------------------------------- */
function initVersionPicker() {
  var select = document.getElementById('versionSelect');
  var badge = document.getElementById('versionSource');
  if (!select || !badge) return;

  var chosen = (typeof RYUUJS_CHOSEN !== 'undefined') ? RYUUJS_CHOSEN : 'local';
  var versions = (typeof RYUUJS_VERSIONS !== 'undefined') ? RYUUJS_VERSIONS : [];

  var localOpt = document.createElement('option');
  localOpt.value = 'local';
  localOpt.textContent = 'Local (dev build)';
  select.appendChild(localOpt);

  versions.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });

  select.value = chosen;
  badge.textContent = chosen === 'local' ? 'local' : 'cdn';
  badge.className = 'version-picker__badge ' +
    (chosen === 'local' ? 'version-picker__badge--local' : 'version-picker__badge--cdn');

  select.addEventListener('change', function() {
    var next = select.value;
    var url = new URL(window.location.href);
    if (next === 'local') {
      url.searchParams.delete('v');
    } else {
      url.searchParams.set('v', next);
    }
    window.location.href = url.toString();
  });
}

/* -----------------------------------------------------------------------
   Device Detection (unchanged from original)
   ----------------------------------------------------------------------- */
function updateDeviceInfo() {
  var el = document.getElementById('deviceType');
  if (!el) return;

  try {
    var isIOSResult = GeneralUtils.isIOS();
    var ua = navigator.userAgent;
    var deviceType = 'Desktop';
    var deviceClass = 'non-ios-device';

    if (isIOSResult) {
      if (/iphone/i.test(ua)) deviceType = 'iPhone';
      else if (/ipad/i.test(ua)) deviceType = 'iPad';
      else if (/ipod/i.test(ua)) deviceType = 'iPod';
      else deviceType = 'iOS Device';
      deviceClass = 'ios-device';
    } else {
      if (/android/i.test(ua)) deviceType = 'Android';
      else if (/windows/i.test(ua)) deviceType = 'Windows';
      else if (/mac/i.test(ua)) deviceType = 'Mac';
      else if (/linux/i.test(ua)) deviceType = 'Linux';
    }

    el.textContent = deviceType;
    el.className = 'device-badge ' + deviceClass;
  } catch (error) {
    el.textContent = 'Error';
    el.className = 'device-badge';
  }
}

/* -----------------------------------------------------------------------
   Initialize
   ----------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  window.app = new DomoApp();
  window.app.init();
});
