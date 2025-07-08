--- 
stoplight-id: e947d87e17547
---

# domo.js

<!-- theme: info -->

> **Prerequisites:**
> If you are new to JavaScript programming, we recommend reviewing a JavaScript tutorial before proceeding. A basic understanding of JavaScript is required to use domo.js effectively.

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

```js
// Import or include domo.js in your app
// npm install ryuu.js OR use <script src="https://unpkg.com/ryuu.js"></script>

// Fetch data from a dataset
const data = await domo.get('/data/v1/sales');
console.log(data);

// Listen for dataset updates
// domo.onDataUpdated((alias) => { ... });
```

---

## Installation

Install via npm:
```sh
npm install ryuu.js
```
Or include via script tag:
```html
<script src="https://unpkg.com/ryuu.js"></script>
```

---

## Global API Overview

The `domo` object is available globally in your app and provides the following methods and properties:

- **HTTP Methods:** `get`, `getAll`, `post`, `put`, `delete`
- **Navigation:** `navigate`
- **Environment:** `env`
- **Filters:** `filterContainer`, `onFiltersUpdate`
- **Variables:** `onVariablesUpdated`, `sendVariables`
- **App Data:** `onAppDataUpdated`, `sendAppData`
- **Events:** `onDataUpdated`
- **Utilities:** (internal use, not all are public)

---

## Deprecated API

> **Migration Guide:**
> The following methods are deprecated and will be removed in a future release. Please use the new names instead for future compatibility.

- `domo.onDataUpdate` → `domo.onDataUpdated`
- `domo.onFiltersUpdate` → `domo.onFiltersUpdated`
- `domo.onAppData` → `domo.onAppDataUpdated`
- `domo.filterContainer` → `domo.requestFiltersUpdate`
- `domo.sendVariables` → `domo.requestVariablesUpdate`
- `domo.sendAppData` → `domo.requestAppDataUpdate`

> The new names are more consistent and descriptive. Update your code to use the new names for future compatibility.

---

## Usage

---

Once installed, you can use the `domo.js` library in your Custom App. The library is available as a global variable named `domo`.

### HTTP Methods

#### domo.get()

---

`domo.js` makes it easy to request data from Domo. Simply
call the data endpoint with your DataSet's alias (`sales` in this example):

```js
const data = await domo.get('/data/v1/sales');
console.log('data', data);

/**
 * [
 *   {... defined props in manifest.json ...},
 *   ...
 * ]
 */
```

<!-- theme: info -->

> #### Best Practice
>
> The code above will fetch the entire DataSet. We highly recommend filtering and paginating the data to avoid app crashes, slow response, and other issues. See the [Getting Data Guide](../Guides/getting-data.md) to learn how to do this.

Domo supports a few different data formats. To specify the one you want, pass an options argument to `domo.get`:

```js
const format = 'csv';
const data = await domo.get('/data/v1/sales', { format });
console.log('data', data);
```

The supported data formats are:

- `array-of-objects` (default)
- `array-of-arrays`
- `excel` and
- `csv`

The `domo` http client also supports `post`, `put`, and `delete` methods to satisfy the other HTTP method verbs. They operate in much the same way as `domo.get`. However, the `post` and `put` methods also take a body parameter as the second argument before the options parameter. For all `post` and `put` requests, the body is assumed to be in JSON format unless the `contentType` property is set to 'multipart' in the options object. Below is an example of using `domo.post` to perform a multipart upload of a file to the Files API.

#### Code Example

```js
function uploadFile(name, description = '', isPublic = true, file) {
  const formData = new FormData();
  formData.append('file', file);
  const url = `/domo/data-files/v1?name=${name}&description=${description}&public=${isPublic}`;
  const options = { contentType: 'multipart' };

  return domo.post(url, formData, options);
}
```

#### domo.getAll()

Fetch multiple datasets or endpoints in parallel. Returns a Promise resolving to an array of results.

```js
const [sales, inventory] = await domo.getAll(['/data/v1/sales', '/data/v1/inventory']);
```

#### domo.post()

Send a POST request. Takes a URL, a body (object or FormData), and optional options.

```js
// This is an AppDB endpoint, view that documentation to learn more about payloads
const url = '/domo/datastores/v1/collections/Users/documents/';
const data = await domo.post(url, { foo: 'bar' });

/** 
 * Response Payload
 * { 
 *   id: abc123,
 *   ...
 *   content: {
 *     foo: 'bar'
 *   }
 * }
 */
```

#### domo.put()

Send a PUT request. Takes a URL, a body, and optional options.

```js
// This is an AppDB endpoint, view that documentation to learn more about payloads
const url = '/domo/datastores/v1/collections/Users/documents/abc123';
const data = await domo.put(url, { foo: 'baz' });

/** 
 * Response Payload
 * { 
 *   id: abc123,
 *   ...
 *   content: {
 *     foo: 'baz'
 *   }
 * }
 */
```

#### domo.delete()

Send a DELETE request. Takes a URL and optional options.

```js
// This is an AppDB endpoint, view that documentation to learn more about payloads
const url = '/domo/datastores/v1/collections/Users/documents/abc123';
const data = await domo.delete(url);
/** 
 * Response Payload
 * true | false
 */
```

---

### Navigation

---

<!-- theme: warning -->

> #### Known Limitation
>
> Regular HTML link syntax will not work in Domo Apps. Use the domo.navigate javascript function below to create a link.
> Custom Apps can navigate the main window to other locations in Domo. For example, when the user clicks on a user profile image in a Custom App, the page could navigate to that user's profile page.

Using the `domo.js` library, your app can request a navigation change to a specific URL:

```js
domo.navigate('/profile/3234');
```

If you want the navigation to open a new tab or window, rather than navigating away from the current Domo page, pass `true` as the second argument:

```js
domo.navigate('/profile/3234', true);
```

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

---

Some meta-data specific to Domo is passed into the card as query parameters in the iframe.

```html
<iframe
  src="//85992d26-6d77-4c99-95e2-7284ecbbdcb0.domoapps.prod2.domo.com?userId=2133179061&customer=dev&locale=en-US&environment=dev3&platform=desktop&size=large"
></iframe>
```

The domo.js library parses and exposes these in the `domo.env` object.

**Note:** This same information is also available by performing a `GET` request to `/domo/environment/v1/`. This is the preferred method as it will always return the currently logged in user information rather than whatever is in the URL (which can be modified by a user or copied and pasted when users share links). The downside is that this is an asynchronous HTTP call instead of simply being available as soon as your application loads. As the developer, you will need to weigh these factors when considering which method to use.

#### pageId

An id to identify the page in Domo that the app is currently living on.

```js
domo.env.pageId // Example: 943487158
```

#### userId

An id unique to the user that is viewing the card.

```js
domo.env.userId // Example: 2133179061
```

#### customer

The name of the customer on which the app has been installed.

```js
domo.env.customer // Example: domo-instance
```

#### locale

The locale set on the customer that the app is installed with.

```js
domo.env.locale // Example: en-US
```

#### environment

The environment that the app is running on. This may be useful for hiding features that are not ready for production yet.

```js
domo.env.environment // Example: dev3
```

#### platform

The platform that the user is using to view the app. Currently only `desktop` is supported, but there are plans for `mobile` to be implemented as well.

```js
domo.env.platform // Example: desktop
```

---

## Data & Event Handling

### domo.onDataUpdated()

---

Registers a callback to be called when the underlying dataset changes. Useful for live-updating apps. The parameter passed to the callback will be the alias of the dataset that was updated.

```js
domo.onDataUpdated((datasetAlias) => {
  // handle updated data
});
```

### domo.filterContainer()

---

If you want to add filters to the page that your domo app lives on, you can do so using the `domo.filterContainer` method. The method takes an array of objects that make up a filter configuration.

#### Code example

```js
domo.filterContainer([
  {
    column: 'category',
    operator: 'IN',
    values: ['ALERT'],
    dataType: 'string',
  },
]);
```

This example will programmatically add a page filter for any column that is named 'category' and has a value of 'ALERT' to only show rows in the dataset who are in an "alert" state.

#### Filter Configuration

**column** a string representing the column name

**operator** the comparison operator that the filter will use. Possible values include:

- 'EQUALS'
- 'NOT_EQUALS'
- 'IN'
- 'NOT_IN'
- 'GREATER_THAN'
- 'GREAT_THAN_EQUALS_TO'
- 'LESS_THAN'
- 'LESS_THAN_EQUALS_TO'
- 'BETWEEN'
- 'NOT_BETWEEN'
- 'LIKE'
- 'NOT_LIKE'

**values** an array of values to compare against.

**dataType** the type of data that is contained in the values array. Possible values include:

- 'date'
- 'datetime'
- 'numeric'
- 'string'

### domo.onFiltersUpdate()

---

If a page filter is applied and a dataset wired to the Domo app is affected by this filter, the Domo app will be refreshed by default. In some cases, you may not want the app to refresh because it is in the middle of a stateful operation that needs to continue. In this scenario, you can manually handle the filter event in your app and disable the default refresh behavior by using the `domo.onFiltersUpdate` method.

#### Code Example

```js
domo.onFiltersUpdate(console.log);

// results:
//[
//	{
//	  affectedCardUrns: undefined
//	  aggregated: undefined
//	  aggregation: undefined
//	  cardURN: undefined
//	  column: "category"
//	  dataSourceId: "46d91556-1317-253c-bd99-7e845f98f146"
//	  dataType: "string"
//	  dateJoinColumn: undefined
//	  fiscal: undefined
//	  label: "category"
//	  operand: "IN"
//	  values: ["ALERT"]
//	}
//]
```

### domo.onVariablesUpdated()

---

This method registers a callback function that executes whenever a variable on the page changes. This method is not required, but is useful when you have variables on the page you want to synchronize the application to.

#### Code Example

```js
domo.onVariablesUpdated(console.log);

// Example Output
// NOTE: 391 is the variable ID that the value is associated with
// {
//   "391": {
//     "parsedExpression": {
//       "exprType": "NUMERIC_VALUE",
//       "value": "9"
//     }
//   }
// }
```

### domo.sendVariables()

Programmatically update variables on the page.

```js
domo.sendVariables({ variableId: "value" });
```

### domo.onAppDataUpdated()

Registers a callback for when app data changes.

```js
domo.onAppDataUpdated((data) => {
  // handle app data update
});
```

### domo.sendAppData()

Send custom app data to the Domo platform.

```js
domo.sendAppData({ key: "value" });
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