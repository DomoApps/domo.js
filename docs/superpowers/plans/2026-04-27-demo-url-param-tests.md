# Demo URL Param Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `params` category to the demo Test Suite with one card per iframe URL param, asserting presence, validity, and contextual expectation — including the regression-prone `customer` and `embedCode` params from DOMO-483881.

**Architecture:** Vanilla JS additions to two existing demo files. A small param-snapshot helper reads `location.search` once per run and returns flags for the contextual cards. A `makeParamCard()` factory produces card definitions from a small per-param config (validity check + expectation rule). Twelve named-param cards plus one `arg-*` rollup card append to the existing `testDefinitions` array.

**Tech Stack:** Vanilla browser JS, no build pipeline for demo source — files load via `<script>` tag in `demo/index.html`. No new dependencies. Verification is interactive in a real Domo iframe (no jest layer for demo files; the demo itself is the runtime test runner).

**Spec:** `docs/superpowers/specs/2026-04-27-demo-url-param-tests-design.md`

---

## File Map

| File | Change |
|---|---|
| `demo/assets/js/config.js` | Add `params` entry to `CATEGORY_META` |
| `demo/assets/js/test-suite.js` | Add `getParamSnapshot()`, validity helpers, `makeParamCard()` factory, 13 card definitions |

No new files. No SDK changes. No HTML changes.

---

## Verification Pattern

Demo source files have no jest tests today and adding a parallel jest infrastructure for trivial regex helpers is not warranted. Verification is interactive: after each task, the engineer rebuilds and reloads the demo iframe, then visually confirms the new cards appear with the expected status. Each task's "verify" step lists exactly what to look for.

To rebuild after editing demo source:
- No build step is required for demo source files. `demo/assets/js/*.js` are loaded directly by the iframe — just reload the page in Domo (or hard-refresh if the iframe is cached) after editing.
- `npm run build:demo` is only needed to publish to `public-assets/`. For iterative iframe testing, edit-and-reload is sufficient.

---

## Task 1: Add `params` category metadata

**Files:**
- Modify: `demo/assets/js/config.js:50-59`

- [ ] **Step 1: Add `params` entry to `CATEGORY_META`**

Edit `demo/assets/js/config.js`. The existing `CATEGORY_META` object lives at lines 50-59. Add a new entry between `utils` and `dx` (alphabetical-ish, but the spec calls for `params` to feel adjacent to `utils`):

```js
const CATEGORY_META = {
  data:       { icon: 'Q', label: 'Data API',     cssClass: 'data' },
  appdb:      { icon: 'D', label: 'AppDB',        cssClass: 'appdb' },
  events:     { icon: '~', label: 'Events',       cssClass: 'events' },
  codeengine: { icon: '>', label: 'Code Engine',  cssClass: 'codeengine' },
  workflow:   { icon: '%', label: 'Workflows',    cssClass: 'workflow' },
  ai:         { icon: '*', label: 'AI Services',  cssClass: 'ai' },
  utils:      { icon: '#', label: 'Utilities',    cssClass: 'utils' },
  params:     { icon: '?', label: 'URL Params',   cssClass: 'params' },
  dx:         { icon: '+', label: 'DX Tools',     cssClass: 'dx' },
};
```

The `cssClass: 'params'` is referenced in the icon class `category-icon--params`. There is no specific stylesheet rule for `--params` today; the demo's CSS gracefully no-ops when no rule exists, and the category will inherit default header styling. That's acceptable for now — visual polish (a dedicated color) can come in a follow-up if desired.

- [ ] **Step 2: Verify category renders empty (no cards yet)**

Reload the demo iframe. In the Test Suite tab, scroll the category list. Expected: a new "URL Params" header appears with a `?` icon and a `0` count badge. No cards under it yet.

- [ ] **Step 3: Commit**

```bash
git add demo/assets/js/config.js
git commit -m "Add params category to demo Test Suite metadata"
```

---

## Task 2: Add `getParamSnapshot()` and validity helpers

**Files:**
- Modify: `demo/assets/js/test-suite.js` (top section, before `testDefinitions`)

- [ ] **Step 1: Add the helpers**

Open `demo/assets/js/test-suite.js`. The file currently starts with the `EVENT_ALIASES` block at line 15 and `testDefinitions` at line 73. Insert a new "URL param helpers" block between the existing `EVENT_FEATURES` constant (ends ~line 69) and `testDefinitions`:

```js
// ── URL param helpers ──────────────────────────────────────────────

// Read all query params off the iframe URL into a plain object.
// Mirrors src/utils/general.ts:getQueryParams() so we assert on the
// raw wire surface, not the normalized domo.env shape.
function readQueryParams() {
  const result = {};
  const query = (location.search || "").replace(/^\?/, "");
  if (!query) return result;
  query.split("&").forEach(function (part) {
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    const val = eq === -1 ? "" : decodeURIComponent(part.slice(eq + 1));
    if (key) result[key] = val;
  });
  return result;
}

// Snapshot of everything a param card needs to decide pass/fail.
// Read fresh on each test run so re-running after registering event
// listeners or after env loads gives the up-to-date answer.
function getParamSnapshot() {
  const params = readQueryParams();
  const filtersList =
    window.domo && window.domo.listeners && window.domo.listeners.onFiltersUpdated;
  const hasFiltersListener = Array.isArray(filtersList) && filtersList.length > 0;
  const isEmbedded =
    typeof window.ENV !== "undefined" || /\/embed\//.test(location.pathname);
  return {
    params: params,
    hasFiltersListener: hasFiltersListener,
    isEmbedded: isEmbedded,
    hasPageId: Boolean(params.pageId),
    hasDataAppId: Boolean(params.dataAppId),
  };
}

// ── Param validity checkers ────────────────────────────────────────

function isNonEmpty(s) { return typeof s === "string" && s.length > 0; }
function isDigits(s)   { return isNonEmpty(s) && /^\d+$/.test(s); }
function isEmail(s)    { return isNonEmpty(s) && /.+@.+\..+/.test(s); }
function isLocale(s)   { return isNonEmpty(s) && /^[a-z]{2}(-[A-Z]{2})?$/.test(s); }
function isPlatform(s) { return s === "desktop" || s === "mobile"; }
function isJsonArray(s) {
  if (!isNonEmpty(s)) return false;
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed);
  } catch (_) {
    return false;
  }
}
```

- [ ] **Step 2: Verify the helpers are reachable**

Reload the demo iframe. Open the browser console and run:

```js
getParamSnapshot()
```

Expected: an object with `params`, `hasFiltersListener`, `isEmbedded`, `hasPageId`, `hasDataAppId`. The `params` key should be a flat object of every URL query param — should at minimum include `userId`, `userName`, etc. (whatever DomoWeb sent for this app).

Also try:

```js
isDigits("123")        // true
isDigits("12a")        // false
isEmail("a@b.co")      // true
isLocale("en-US")      // true
isLocale("en")         // true
isLocale("en-us")      // false (lowercase region)
isPlatform("desktop")  // true
isJsonArray("[]")      // true
isJsonArray("{}")      // false
```

- [ ] **Step 3: Commit**

```bash
git add demo/assets/js/test-suite.js
git commit -m "Add URL param snapshot + validity helpers to demo test suite"
```

---

## Task 3: Add `makeParamCard()` factory and the 7 always-expected cards

**Files:**
- Modify: `demo/assets/js/test-suite.js`

- [ ] **Step 1: Add the factory below the validity helpers**

Insert directly after the `isJsonArray` definition from Task 2:

```js
// ── Param test card factory ────────────────────────────────────────

// Build a test definition that asserts presence, validity, and contextual
// expectation of a single URL param.
//
//   name           — param name (used as test name and card id)
//   description    — short blurb shown in the card header
//   validate       — (value) => true | string. true = valid, string = error msg
//   isExpected     — (snapshot) => true | false
//   expectedReason — (snapshot, expected) => human-readable string
function makeParamCard(name, opts) {
  return {
    name: "param." + name,
    category: "params",
    description: opts.description,
    fn: function () {
      const snap = getParamSnapshot();
      const value = snap.params[name];
      const found = isNonEmpty(value);
      const expected = opts.isExpected(snap);
      const reason = opts.expectedReason(snap, expected);

      if (found) {
        const valid = opts.validate(value);
        if (valid !== true) {
          throw new Error("Invalid value: " + valid + " (got " + JSON.stringify(value) + ")");
        }
      }
      if (expected && !found) {
        throw new Error("Expected but missing");
      }
      if (!expected && found) {
        throw new Error("Present but not expected here (value=" + JSON.stringify(value) + ")");
      }

      return {
        _render: "payload",
        direction: "received",
        method: "url-param",
        payload: {
          param: name,
          status: found ? "Found" : "Missing",
          value: found ? value : "N/A",
          expected: reason,
          valid: found ? "yes" : "n/a",
        },
      };
    },
  };
}
```

The factory throws on three conditions: invalid value (validity check failed), expected-but-missing, and present-but-not-expected. All three map to `fail` in the existing `_runTest` (line 1012). The success path (resolved promise) maps to `success`. The two informational cards (`appData`, `arg-*`) bypass the factory entirely — see Task 5.

- [ ] **Step 2: Add the 7 always-expected card definitions**

Append to the end of the existing `testDefinitions` array (which currently closes at line 671 with `},];`). Insert these new entries just before the closing `];`:

```js
  // ── URL Params ─────────────────────────────────────────────────
  makeParamCard("userId", {
    description: "Numeric user ID — always emitted",
    validate: function (v) { return isDigits(v) || "must be all digits"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("userName", {
    description: "Display name — always emitted",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("userEmail", {
    description: "User email — always emitted",
    validate: function (v) { return isEmail(v) || "must look like an email"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("customer", {
    description: "Domo instance/customer — always emitted (regression: dropped post-pivot, restored by DOMO-483881)",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("locale", {
    description: "User locale — always emitted",
    validate: function (v) { return isLocale(v) || "must be xx or xx-XX"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("environment", {
    description: "Domo environment name — always emitted",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
  makeParamCard("platform", {
    description: "Platform — always emitted as desktop or mobile",
    validate: function (v) { return isPlatform(v) || "must be desktop or mobile"; },
    isExpected: function () { return true; },
    expectedReason: function () { return "Always"; },
  }),
```

- [ ] **Step 3: Verify the 7 cards render and behave correctly**

Reload the demo iframe. In the Test Suite tab, scroll to the new "URL Params" category. Expected:

- 7 cards visible: `param.userId`, `param.userName`, `param.userEmail`, `param.customer`, `param.locale`, `param.environment`, `param.platform`.
- Click **Run Category** on URL Params. Expected:
  - `userId`, `userName`, `userEmail`, `locale`, `environment`, `platform` → green (Passed) — DomoWeb emits all of these today.
  - `customer` → **red (Failed)** with message "Expected but missing" — this is the DOMO-483881 regression. This is the desired result; it confirms the test catches the missing param.
- Clicking **Run** on a single card should produce the same outcome and show the structured payload (`status`, `value`, `expected`, `valid`) in the details block.

If the always-expected cards (other than `customer`) fail, debug the reading logic before proceeding.

- [ ] **Step 4: Commit**

```bash
git add demo/assets/js/test-suite.js
git commit -m "Add always-expected URL param cards to demo test suite"
```

---

## Task 4: Add the 4 context-conditional cards

**Files:**
- Modify: `demo/assets/js/test-suite.js`

- [ ] **Step 1: Append context-conditional card definitions**

Insert these directly after the `platform` card from Task 3, still before the closing `];` of `testDefinitions`:

```js
  makeParamCard("analyzer", {
    description: "Initial filter blob — emitted when the app accepts filters",
    validate: function (v) { return isJsonArray(v) || "must parse as a JSON array"; },
    isExpected: function (snap) { return snap.hasFiltersListener; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — app registered onFiltersUpdated"
        : "No — no onFiltersUpdated listener (re-run after clicking 'Register Event Listeners')";
    },
  }),
  makeParamCard("pageId", {
    description: "Page ID — emitted when launched on a page (mutually exclusive with dataAppId)",
    validate: function (v) { return isDigits(v) || "must be all digits"; },
    isExpected: function (snap) { return !snap.hasDataAppId; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — not launched as a data app"
        : "No — dataAppId is present, so pageId is absent";
    },
  }),
  makeParamCard("dataAppId", {
    description: "Data App ID — emitted when launched as a data app (mutually exclusive with pageId)",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function (snap) { return !snap.hasPageId; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — not launched on a page"
        : "No — pageId is present, so dataAppId is absent";
    },
  }),
  makeParamCard("embedCode", {
    description: "Embed token — emitted only in embed mode (regression: renamed to embedToken post-pivot, restored by DOMO-483881)",
    validate: function (v) { return isNonEmpty(v) || "must be non-empty"; },
    isExpected: function (snap) { return snap.isEmbedded; },
    expectedReason: function (snap, expected) {
      return expected
        ? "Yes — app is loaded via embed"
        : "No — not embedded";
    },
  }),
```

- [ ] **Step 2: Verify behavior in the standard iframe context**

Reload the demo iframe. Click **Run Category** on URL Params. Expected for the new cards (assuming standard launch on a page with the user having clicked "Register Event Listeners" via the banner first):

- `pageId` → green. The card's payload shows `expected: "Yes — not launched as a data app"`.
- `dataAppId` → green (passed via the "absent + not expected" path). Payload shows `status: Missing`, `expected: "No — pageId is present, so dataAppId is absent"`.
- `analyzer` → behavior depends on whether event listeners were registered. If yes: green (present + valid JSON array + expected). If no: green via the absent-not-expected path.
- `embedCode` → in a non-embed launch: green via absent-not-expected. In an embed launch: **red** today (the V2 regression — emitted under wrong name `embedToken`).

Re-run the URL Params category after clicking "Register Event Listeners" in the banner. Expected: `analyzer` should now be green via the present-and-expected path and the payload should show the JSON-parsed filter blob excerpt.

- [ ] **Step 3: Commit**

```bash
git add demo/assets/js/test-suite.js
git commit -m "Add context-conditional URL param cards to demo test suite"
```

---

## Task 5: Add the 2 informational cards (`appData` and `arg-*` rollup)

**Files:**
- Modify: `demo/assets/js/test-suite.js`

- [ ] **Step 1: Append the `appData` card and the `arg-*` rollup**

Both informational cards are hand-written rather than factory-built — they always resolve as `success` (with a payload that describes whether the value was found) because their semantics are "present and absent are both fine." Reusing the factory's "skip" sentinel would surface a misleading "Not available in this version" message, so we bypass the factory here. Insert directly after the `embedCode` card:

```js
  {
    name: "param.appData",
    category: "params",
    description: "Pass-through app data from the parent page (informational — present and absent are both fine)",
    fn: function () {
      const snap = getParamSnapshot();
      const value = snap.params.appData;
      const found = isNonEmpty(value);
      return {
        _render: "payload",
        direction: "received",
        method: "url-param",
        payload: {
          param: "appData",
          status: found ? "Found" : "Missing",
          value: found ? value : "N/A",
          expected: "Pass-through — present or absent are both fine",
          valid: found ? "yes" : "n/a",
        },
      };
    },
  },
  {
    name: "param.arg-*",
    category: "params",
    description: "appargs forwarded by the parent — lists every arg-* query param found",
    fn: function () {
      const snap = getParamSnapshot();
      const args = {};
      Object.keys(snap.params).forEach(function (key) {
        if (key.indexOf("arg-") === 0) {
          args[key] = snap.params[key];
        }
      });
      const count = Object.keys(args).length;
      return {
        _render: "payload",
        direction: "received",
        method: "url-param-rollup",
        payload: {
          status: count > 0 ? "Found " + count + " arg-* param(s)" : "No arg-* params present",
          values: args,
          expected: "Pass-through — manifest may or may not declare appargs",
        },
      };
    },
  },
```

Both cards always resolve (never throw), so they always land on `success` status. `appData` uses the same payload shape as the factory cards so the details block looks consistent. `arg-*` uses a slightly different shape with a `values` map since it can show many params at once.

- [ ] **Step 2: Verify both cards render**

Reload the demo iframe. Expected in the URL Params category:

- `param.appData` → green (Passed). Payload shows `status: "Missing"`, `value: "N/A"`, `expected: "Pass-through — present or absent are both fine"`. (The demo iframe URL almost certainly has no `appData` param. The card passes either way.)
- `param.arg-*` → green (success). Payload shows `status: "No arg-* params present"` (assuming the demo's `manifest.json` declares no appargs) and `values: {}`. If you manually add `?arg-foo=bar` to the iframe URL and reload, the card should show `status: "Found 1 arg-* param(s)"` and `values: { "arg-foo": "bar" }`.

- [ ] **Step 3: Commit**

```bash
git add demo/assets/js/test-suite.js
git commit -m "Add appData and arg-* informational URL param cards"
```

---

## Task 6: Final end-to-end verification

**Files:**
- None modified in this task (verification + small polish if needed).

- [ ] **Step 1: Run the entire suite and survey the URL Params category**

Reload the demo iframe (use a hard refresh to bust any iframe cache). Click **Register Event Listeners** in the banner. Then click **Run All Tests**.

Expected results in the URL Params category (V2 launch on a normal page, before DOMO-483881 fix lands in DomoWeb):

| Card | Status | Reason |
|---|---|---|
| `param.userId` | Passed | Found + valid digits + always expected |
| `param.userName` | Passed | Found + valid + always expected |
| `param.userEmail` | Passed | Found + email shape + always expected |
| `param.customer` | **Failed** | Missing — DOMO-483881 regression |
| `param.locale` | Passed | Found + valid locale + always expected |
| `param.environment` | Passed | Found + non-empty + always expected |
| `param.platform` | Passed | Found = "desktop" + always expected |
| `param.analyzer` | Passed | Found + JSON array + onFiltersUpdated registered |
| `param.pageId` | Passed | Found + digits + dataAppId absent |
| `param.dataAppId` | Passed | Missing + pageId is present (absent-not-expected) |
| `param.embedCode` | Passed | Missing + not embedded (absent-not-expected) |
| `param.appData` | Passed | Informational — pass-through (always passes) |
| `param.arg-*` | Passed | Rollup, never fails |

If any always-expected card other than `customer` fails, that's a real bug to investigate before considering this task done.

- [ ] **Step 2: Verify the Run Category and Run Single buttons work for params**

Click **Run Category** on URL Params alone. Same results should reproduce.

Click **Run** on a single param card (e.g. `param.userId`). The card's payload should display in the details block: `param`, `status`, `value`, `expected`, `valid`.

- [ ] **Step 3: Verify the existing test categories still work**

Click **Run All Tests** with full attention on the non-params categories. Compare to baseline behavior — none of the existing HTTP, AppDB, events, codeengine, workflow, ai, utils, or dx tests should have changed. (This work only adds new test definitions; the runner is untouched.)

- [ ] **Step 4: Verify the export still works**

Click **Export Results**. The downloaded JSON should include the new param cards in its results array, with the same shape as existing cards.

- [ ] **Step 5: If any tweaks needed, commit them**

If verification surfaces issues (typos, missing fields, formatting glitches in the details block), fix and commit:

```bash
git add demo/assets/js/test-suite.js demo/assets/js/config.js
git commit -m "Polish URL param cards after end-to-end verification"
```

If no tweaks are needed, skip the commit and proceed. (Frequent commits are encouraged but empty/noise commits are not.)

---

## Done When

- All 13 cards appear in the URL Params category in the Test Suite tab.
- Always-expected cards report `Failed` for `customer` (regression) and `Passed` for the other six.
- Context-conditional cards correctly classify `analyzer`, `pageId`, `dataAppId`, `embedCode` based on app state.
- `appData` and `arg-*` rollup show as Passed (informational), with `arg-*` listing any present values.
- Existing tests are unchanged.
- All work is committed on the `more-tests` branch.
