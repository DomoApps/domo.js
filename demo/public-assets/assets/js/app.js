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
    renderSdkFallbackBanner();
    this._initTabs();
    this._initEnvPanel();

    // Mount tab contents
    this.requestBuilder.mount(document.getElementById('tab-content-request'));
    this.eventMonitor.mount(document.getElementById('tab-content-monitor'));
    this.testSuite.mount(document.getElementById('tab-content-tests'));

    // Start event monitoring immediately so early events (ACKs, initial
    // filter/variable pushes) are captured before the user switches tabs.
    this.eventMonitor.startMonitoring();

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
        ['Analyzer', env.analyzer || 'N/A'],
        ['Debug', debugOn ? 'ON' : 'OFF'],
        ['Environment', window.DEMO_ENV ? window.DEMO_ENV.name : 'local'],
        ['Version', sdkVersionLabel()],
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
   SDK channel — what index.html asked for vs what actually loaded
   ----------------------------------------------------------------------- */
function sdkVersionLabel() {
  var fallback = (typeof RYUUJS_FALLBACK !== 'undefined') ? RYUUJS_FALLBACK : null;
  if (fallback) return fallback.requested + ' → ' + fallback.loaded + ' (fallback)';
  return (typeof RYUUJS_CHOSEN !== 'undefined') ? RYUUJS_CHOSEN : 'unknown';
}

// A dist-tag with nothing published (rc, before the first rc) falls back to latest in index.html. Say so, so a
// latest run is never mistaken for an rc run.
function renderSdkFallbackBanner() {
  var fallback = (typeof RYUUJS_FALLBACK !== 'undefined') ? RYUUJS_FALLBACK : null;
  var container = document.querySelector('.container');
  if (!fallback || !container) return;

  var banner = document.createElement('div');
  banner.className = 'sdk-fallback-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = '<strong>ryuu.js@' + DataRenderer.escapeHTML(fallback.requested) + ' is not published yet.</strong> ' +
    'This page is running ryuu.js@' + DataRenderer.escapeHTML(fallback.loaded) + ', so these results are not ' +
    DataRenderer.escapeHTML(fallback.requested) + ' results.';
  container.insertBefore(banner, container.firstChild);
}

/* -----------------------------------------------------------------------
   Version Picker
   ----------------------------------------------------------------------- */
function initVersionPicker() {
  var select = document.getElementById('versionSelect');
  var badge = document.getElementById('versionSource');
  if (!select || !badge) return;

  var chosen = (typeof RYUUJS_CHOSEN !== 'undefined') ? RYUUJS_CHOSEN : 'local';
  var defaultChannel = (typeof RYUUJS_DEFAULT !== 'undefined') ? RYUUJS_DEFAULT : 'local';
  var versions = (typeof RYUUJS_VERSIONS !== 'undefined') ? RYUUJS_VERSIONS : [];

  function addOption(value, label) {
    var opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }

  // A deployed build (env.js present) ships no local domo.js, so offering it would only 404.
  if (!window.DEMO_ENV) addOption('local', 'Local (dev build)');
  addOption('beta', 'beta (npm tag)');
  addOption('rc', 'rc (npm tag)');
  addOption('latest', 'latest (npm tag)');
  versions.forEach(function(v) { addOption(v, v); });

  // A ?v= value that is not listed (a newer release, say) would otherwise leave the select blank.
  var listed = Array.prototype.some.call(select.options, function(opt) { return opt.value === chosen; });
  if (!listed) addOption(chosen, chosen);

  select.value = chosen;
  badge.textContent = chosen === 'local' ? 'local' : 'cdn';
  badge.className = 'version-picker__badge ' +
    (chosen === 'local' ? 'version-picker__badge--local' : 'version-picker__badge--cdn');

  select.addEventListener('change', function() {
    var next = select.value;
    var url = new URL(window.location.href);
    // Choosing the page's own default drops ?v=, so the link goes back to following that channel.
    if (next === defaultChannel) {
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
