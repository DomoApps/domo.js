# Demo URL Param Tests — Design

**Ticket:** [DOMO-483881](https://onjira.domo.com/browse/DOMO-483881)
**Scope:** Demo app only — `demo/assets/js/`. No SDK changes.

## Goal

Add tests to the demo app's Test Suite that, for each iframe URL param the app expects, report whether it is present, whether its value is valid, and whether its presence (or absence) matches the current app state. The tests must catch the regressions described in DOMO-483881 — `customer` dropped post-pivot, `embedCode` renamed to `embedToken` — by failing visibly when those params are missing under the V2 launch path.

## Background

The DomoApp Wrapper V2 pivot (DOMO-481521 / DOMO-482767) replaced `DomoAppURL.stringify()` with a hand-rolled form-POST + query-string surface. Two V1 params were dropped or renamed, and apps reading `domo.env.customer` or `domo.env.embedCode` silently lose data. Demo coverage so far has not asserted on the URL param surface, so these regressions weren't caught at the SDK level.

The demo app already runs inside a real Domo iframe via `manifest.json`, so it sees the same param surface a production app sees. Adding param assertions here gives a manual regression check today and a foundation for headless verification later.

## Param Matrix

| Param | Expected when | Validity check | Source |
|---|---|---|---|
| `userId` | Always | Non-empty, all digits | Form field |
| `userName` | Always | Non-empty | Form field |
| `userEmail` | Always | Non-empty, matches `*@*.*` | Form field |
| `customer` | Always *(restored by ticket)* | Non-empty | Form field |
| `locale` | Always | Matches `xx` or `xx-XX` | Form field |
| `environment` | Always | Non-empty | Form field |
| `platform` | Always | One of `desktop` / `mobile` | Query string |
| `analyzer` | App registered `onFiltersUpdated` (proxy for `acceptFilters: true`) | Parses as JSON array | Form field + QS |
| `pageId` | App is launched on a page (not a data app) | Non-empty, all digits | Query string |
| `dataAppId` | App is launched as a data app (not a page) | Non-empty | Query string |
| `embedCode` | App is loaded via embed | Non-empty | Form field *(restored by ticket — currently emitted as `embedToken`)* |
| `appData` | Parent passed `?appData=` | Non-empty | Query string (informational) |
| `arg-*` | Manifest declared `appargs` and parent passed values | Present, any value | Query string (informational rollup) |

The "Source" column reflects how DomoWeb emits each param. From the demo's perspective, all of them arrive as iframe URL query params — ryuu-server echoes form fields into the final iframe `src` — so `getQueryParams()` sees the full surface uniformly.

`pageId` and `dataAppId` are mutually exclusive in practice — exactly one of them is expected per launch. `embedCode` is only emitted in embed mode; outside embed it is correctly absent.

## UI Shape

One test card per param in a new `params` category, plus a single `arg-*` rollup card. Total 13 cards (12 named params + 1 rollup). This matches the user-selected layout (option B from brainstorming) and the existing card pattern in `test-suite.js`.

The `arg-*` rollup card lists every `arg-*` query param found, with each value rendered as a row. It passes when at least one `arg-*` is present (manifest wired up correctly) and when none are present (also valid — manifest declared no appargs). It only fails if a present `arg-*` value is somehow malformed, which is unlikely given the "any value" rule.

Each card shows in its `details` block:

```
Status:    Found / Missing
Value:     "abc-123"          (truncated to ~80 chars; "N/A" when missing)
Expected:  Yes — always
           Yes — app registered onFiltersUpdated
           No — not embedded
           Unknown — context could not be determined
```

Card status mapping:

| Card status | Meaning |
|---|---|
| `success` | Present + valid + expected, OR absent + not expected |
| `fail` | Present + invalid, OR present + not expected, OR absent + expected |
| `skipped` | Expectation cannot be determined from app state (rare; only when no signal pins down the launch context) |
| `pending` | Not yet run |

`fail` is the desired result when DOMO-483881 hasn't been remediated: `customer` and `embedCode` will be missing under V2, and their cards will go red.

## Detection Logic

Single helper inside `test-suite.js` reads `location.search` once per test run and exposes a small API:

```
getParamSnapshot() → { params: { [name]: string }, isEmbedded: boolean,
                       hasFiltersListener: boolean, hasPageId: boolean,
                       hasDataAppId: boolean }
```

- `params` — `getQueryParams()`-equivalent inline parser. Tests do not use `domo.env` because the env object normalizes some values and we want to assert on the wire format.
- `isEmbedded` — true if `window.ENV` exists OR `location.pathname.includes('/embed/')`.
- `hasFiltersListener` — `Array.isArray(domo.listeners?.onFiltersUpdated) && domo.listeners.onFiltersUpdated.length > 0`. Read at run time, not test-suite-load time, so re-running after the user clicks "Register Event Listeners" gives the right answer.
- `hasPageId` / `hasDataAppId` — convenience booleans used by the launch-context conditional cards.

Each test card's `fn` calls `getParamSnapshot()`, reads the one param it owns, runs its validity check, and resolves expectation against the snapshot.

## File Changes

| File | Change |
|---|---|
| `demo/assets/js/test-suite.js` | Add `paramTestDefinitions` array (~12 entries) appended to `testDefinitions`. Add `getParamSnapshot()` helper, validity checkers (one small function per shape: `isDigits`, `isEmail`, `isLocale`, `isJsonArray`, `isPlatform`). |
| `demo/assets/js/config.js` | Add `params` entry to `CATEGORY_META` with icon, label, cssClass. |

No new files. No SDK changes. No HTML changes — the test-suite renderer already iterates whatever categories appear in `testDefinitions`.

## Run Order

The Run All flow runs cards in `testDefinitions` order. The `params` category will be inserted at the end of the array so users see HTTP / AppDB / event results first. The `analyzer` card depends on `hasFiltersListener`, which is only accurate after the user registers event listeners via the banner — its `pendingMsg` will note this, and re-running the card or category gives the up-to-date answer.

## Out of Scope

- Restoring `customer` and `embedCode` in DomoWeb. That is the actual ticket fix; this spec is for the demo-side test coverage that proves the fix landed.
- Headless / CI execution of the demo. The cards are meant to be run interactively in the iframe today; CI integration can come later.
- Changes to `domo.env`. The SDK already exposes `customer` and `analyzer`; adding `embedCode` to the typed env is a separate decision outside this spec.
- The `wiring`, `context`, `designOverride`, `date` option slots — dead in V1, intentionally excluded from V2 per the ticket's "Out of scope" section.

## Acceptance

1. New `params` category appears in the Test Suite tab with one card per param listed in the matrix above.
2. Each card reports Status, Value (or N/A), Expected (with a human-readable reason).
3. Running the suite on a current V2 launch produces failures on the `customer` and `embedCode` cards (until DOMO-483881 lands).
4. Running the suite after the ticket fix produces all-green for always-expected params and contextually-correct results for conditional params.
5. The `analyzer` card resolves correctly after the user clicks "Register Event Listeners" — present + parses-as-JSON-array + expected = pass.
