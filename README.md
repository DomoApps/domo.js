--- 
stoplight-id: e947d87e17547
---

# domo.js

<!-- theme: info -->

> **Prerequisites:**
> Basic JavaScript knowledge is required. If you’re new to JavaScript, review a tutorial before using domo.js.

---

## Table of Contents
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Global API Overview](#global-api-overview)
- [Deprecated API](#deprecated-api)
- [Usage](#usage)
  - [HTTP Methods](#http-methods)
  - [Navigation](#navigation)
  - [Environment](#environment)
  - [Data & Event Handling](#data--event-handling)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

Get started with domo.js in just a few lines:

```js
// Import or include domo.js in your app
// npm install ryuu.js OR use <script src="https://unpkg.com/ryuu.js"></script>

// Fetch data from a dataset
const data = await domo.get('/data/v1/sales');
console.log(data); // Logs the dataset rows

// Listen for dataset updates
// domo.onDataUpdated((alias) => { ... });
```

---

## Installation

Install with npm:
```sh
npm install ryuu.js
```
Or add via script tag:
```html
<script src="https://unpkg.com/ryuu.js"></script>
```

---

## Global API Overview

The `domo` object is available globally and provides these main features:

- **HTTP Methods:** Fetch and modify data (`get`, `getAll`, `post`, `put`, `delete`)
- **Navigation:** Change the current Domo page (`navigate`)
- **Environment:** Access app and user context (`env`)
- **Filters:** Listen for and set page filters (`requestFiltersUpdate`, `onFiltersUpdated`)
- **Variables:** Listen for and update page variables (`requestVariablesUpdate`, `onVariablesUpdated`)
- **App Data:** Listen for and send custom app data (`requestAppDataUpdate`, `onAppDataUpdated`)
- **Events:** Listen for dataset changes (`onDataUpdated`)

---

## Deprecated API

> **Migration Guide:**
> The following methods are deprecated for consistency and clarity. Please use the new names for future compatibility.

- `domo.onDataUpdate` → `domo.onDataUpdated` — Listen for dataset changes
- `domo.onFiltersUpdated` → `domo.onFiltersUpdatedd` — Listen for filter changes
- `domo.onAppData` → `domo.onAppDataUpdated` — Listen for app data changes
- `domo.filterContainer` → `domo.requestFiltersUpdate` — Set page filters
- `domo.sendVariables` → `domo.requestVariablesUpdate` — Update page variables
- `domo.sendAppData` → `domo.requestAppDataUpdate` — Send custom app data

> Update your code to use the new names for a more consistent and future-proof API.

---

## Usage

---

Once installed, use the `domo` object in your app to fetch data, listen for events, and interact with the Domo platform.

### HTTP Methods

#### domo.get()

Fetch data from a Domo dataset or endpoint. Returns a Promise with the data.

```js
const data = await domo.get('/data/v1/sales');
console.log(data); // Array of rows from the dataset
```

<!-- theme: info -->
> **Best Practice:**
> Always filter and paginate data to avoid slow responses or app crashes. See the [Getting Data Guide](../Guides/getting-data.md) for details.

You can specify the data format:

```js
const data = await domo.get('/data/v1/sales', { format: 'csv' });
```

Supported formats:
- `array-of-objects` (default)
- `array-of-arrays`
- `excel`
- `csv`

Other HTTP methods work similarly:

#### domo.getAll()
Fetch multiple datasets/endpoints in parallel. Returns a Promise with an array of results.
```js
const [sales, inventory] = await domo.getAll(['/data/v1/sales', '/data/v1/inventory']);
```

#### domo.post()
Send a POST request. Takes a URL, a body, and optional options.
```js
const url = '/domo/datastores/v1/collections/Users/documents/';
const data = await domo.post(url, { foo: 'bar' });
```

#### domo.put()
Send a PUT request. Takes a URL, a body, and optional options.
```js
const url = '/domo/datastores/v1/collections/Users/documents/abc123';
const data = await domo.put(url, { foo: 'baz' });
```

#### domo.delete()
Send a DELETE request. Takes a URL and optional options.
```js
const url = '/domo/datastores/v1/collections/Users/documents/abc123';
const result = await domo.delete(url); // true or false
```

---

### Navigation

Change the current Domo page programmatically.

```js
domo.navigate('/profile/3234'); // Navigates to the profile page
```
To open in a new tab/window:
```js
domo.navigate('/profile/3234', true);
```

<!-- theme: warning -->
> **Note:**
> Use `domo.navigate` instead of HTML links to change the page hosting the Custom App.

#### Mobile Web

The Domo URLs for mobile web are not always the same as those for desktop web. Use the `domo.env.platform` variable to determine which environment your app is running in.
For mobile web, the routes are currently prefixed with `/m#`. For example: `/m#/profile/3234`.

#### External Links

<!-- theme: info -->

> #### Info
>
> For security reasons, Custom Apps can link only to approved, whitelisted domains by default. You can whitelist domains or authorize linking to all domains in "Admin" > "Network Security" > "Custom Apps authorized domains". If you don't see this option, you may need the "Domo Apps Whitelisting" feature switch enabled in your Domo instance.

---

### Environment

Access context about the current user, customer, and app environment via `domo.env`.

Example properties:
- `domo.env.pageId` — Current page ID
- `domo.env.userId` — Current user ID
- `domo.env.customer` — Customer name
- `domo.env.locale` — Locale (e.g., 'en-US')
- `domo.env.environment` — Environment (e.g., 'dev3')
- `domo.env.platform` — Platform (e.g., 'desktop')

These properties are populated from values on the iframe, and can be spoofed. For this reason it's recommended you:

```js
const user = await domo.get('/domo/environment/v1/');
```

This will provide the same information about the authenticated user.

---

### Data & Event Handling

#### domo.onDataUpdated()
Register a callback for when the dataset changes.
```js
domo.onDataUpdated((datasetAlias) => {
  // Handle updated data
});
```

#### domo.requestFiltersUpdate()
Programmatically add or update page filters.
```js
domo.requestFiltersUpdate([
  { column: 'category', operator: 'IN', values: ['ALERT'], dataType: 'string' },
]);
```

#### domo.onFiltersUpdated()
Register a callback for when filters change.
```js
domo.onFiltersUpdated(console.log);
```

#### domo.onVariablesUpdated()
Register a callback for when page variables change.
```js
domo.onVariablesUpdated(console.log);
```

#### domo.requestVariablesUpdate()
Update page variables programmatically.
```js
domo.requestVariablesUpdate({ variableId: 'value' });
```

#### domo.onAppDataUpdated()
Register a callback for when app data changes.
```js
domo.onAppDataUpdated((data) => {
  // Handle app data update
});
```

#### domo.requestAppDataUpdate()
Send custom app data to the Domo platform.
```js
domo.requestAppDataUpdate({ key: 'value' });
```

---

## Error Handling

All HTTP methods return Promises. Use `.catch` to handle errors:

```js
domo.get('/data/v1/sales')
  .then(data => { /* ... */ })
  .catch(err => {
    // handle error
    console.error(err);
  });
```

---

## Contributing

Contributions are welcome! Please open issues or pull requests on GitHub.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.