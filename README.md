# Domo.js

A unified API for interacting with Domo platform features in client applications.

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
  - [HTTP Methods](#http-methods)
  - [Event Listeners](#event-listeners)
  - [Emitters](#emitters)
  - [Utilities](#utilities)
  - [Extending Domo](#extending-domo)
  - [Mutation Observer](#mutation-observer)
- [Full Example](#full-example)
- [License](#license)

---

## Overview

The `Domo` class provides a unified API for interacting with Domo platform features in client applications. It exposes HTTP methods, event listeners, emitters, and utility functions for working with datasets, filters, variables, app data, and navigation.

**Key features:**
- HTTP request methods (`get`, `post`, `put`, `delete`, `domoHttp`)
- Batch request support via `getAll`
- Event listeners for data, filters, variables, and app data updates
- Emitters for sending variables, app data, and navigation events
- Utility functions for environment, origin verification, and query parsing
- Handles cross-frame communication and DOM mutation observation for token injection

---

## Installation

```bash
npm install ryuu.js
```

or include the built file in your HTML:

```html
<script src="ryuu.js"></script>
```

---

## Usage

```js
import Domo from 'ryuu.js';

// Example: GET request
const data = await Domo.get('/data/v1/sales');
console.log(data);
```

---

## API Reference

### HTTP Methods

#### `Domo.get(url: string, options?: RequestOptions)`
Fetches data from the given URL.

**Example:**
```js
const result = await Domo.get('/data/v1/exampleDataset');
/*
Sample response:
[
  { id: "123", foo: "bar" },
  { id: "456", foo: "baz" }
]
*/
```

<!-- theme: info -->

> #### Best Practice
>
> The code above will fetch the entire DataSet. We highly recommend filtering and paginating the data to avoid app crashes, slow response, and other issues. See the [Getting Data Guide](../Guides/getting-data.md) to learn how to do this.

#### `Domo.post(url: string, body: any, options?: RequestOptions)`
Creates a new resource.

**Example:**
```js
const res = await Domo.post('/domo/datastores/v1/collections/exampleCollection/documents/', { foo: "bar" });
/*
Sample response:
{ id: "789", foo: "bar" }
*/
```

#### `Domo.put(url: string, body: any, options?: RequestOptions)`
Updates a resource.

**Example:**
```js
const res = await Domo.put('/domo/datastores/v1/collections/exampleCollection/documents/789', { foo: "baz" });
/*
Sample response:
{ id: "789", foo: "baz" }
*/
```

#### `Domo.delete(url: string, options?: RequestOptions)`
Deletes a resource.

**Example:**
```js
await Domo.delete('/domo/datastores/v1/collections/exampleCollection/documents/789');
```

#### `Domo.getAll(urls: string[], options?: RequestOptions)`
Batch fetch.

**Example:**
```js
const results = await Domo.getAll([
  '/domo/datastores/v1/collections/exampleCollection/documents/123',
  '/domo/datastores/v1/collections/exampleCollection/documents/456'
]);
```

#### `Domo.domoHttp(method, url, options?, body?)`
Low-level HTTP method. The API methods above wrap this function.

**Example:**
```js
const res = await Domo.domoHttp('POST', '/domo/datastores/v1/collections/exampleCollection/documents/', {}, { foo: "bar" });
```

### Supported Data Formats
Domo supports a few different data formats. To specify the one you want, pass an options argument to `domo.get`:

```js
const data = await Domo.get('/data/v1/exampleDataset', { format: 'csv' });
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

---

### Event Listeners

Domo offers multiple events that you can register to listen to--and execute functionality when those events occur.

#### `Domo.onDataUpdated(callback)`
This event fires whenever a DataSet mapped in your manifest.json file is updated (not Collections).  
By default, if your application does not register to this event then Domo will force a refresh on your app to ensure it has the latest data.  To avoid this, you can register an empty function.
```js
Domo.onDataUpdated((data) => {
  console.log('Data updated:', data);
});
```

#### `Domo.onFiltersUpdated(callback)`
Custom Apps can be housed on pages in Domo.  This event fires when a page filter, on the page rendering the app, is changed.  
```js
Domo.onFiltersUpdated((filters) => {
  console.log('Filters updated:', filters);
});
```

#### `Domo.onVariablesUpdated(callback)`
Custom Apps can also be housed in App Studio--within Domo. This event fires whenever an App Studio variable changes.
```js
Domo.onVariablesUpdated((variables) => {
  console.log('Variables updated:', variables);
});
```

#### `Domo.onAppDataUpdated(callback)`
Sometimes Custom Apps need to be embedded, and therefor can't communicate with Domo's message channels natively. This event fires whenever app data changes.
```js
Domo.onAppDataUpdated((appData) => {
  console.log('App data updated:', appData);
});
```

---

### Emitters

Send messages to the parent Domo app.

#### `Domo.requestFiltersUpdate(filters)`
This emits a request, to Domo, to update the Filters as requested.

```js
Domo.requestFiltersUpdate([{ column: "foo", operator: "EQUALS", values: ["bar"] }]);
```

#### `Domo.requestVariablesUpdate(variables)`
This emits a request, to Domo, to update the Variables as requested.

```js
Domo.requestVariablesUpdate({ myVar: 42 });
```

#### `Domo.requestAppDataUpdate(appData)`
This emits a request, to Domo, to update the App Data as requested.

```js
Domo.requestAppDataUpdate({ theme: "dark" });
```

#### `Domo.navigate(url)`
This emits a request, to Domo, to navigate the user somewhere else. This can open a new window or change the existing one.

```js
const openNewWindow = true;
Domo.navigate('/some/other/page', openNewWindow);
```

---

### Utilities

#### `Domo.env`
Environment variables (e.g., userId, instance, etc.)

---

### Extending Domo

Override static methods for testing or customization.

```js
Domo.extend({
  get: async (url, options) => {
    // custom logic
    return [{ id: "mock", foo: "mocked" }];
  }
});
```

---

### Mutation Observer

The Domo class automatically injects authentication tokens into any newly added HTML elements in the DOM using a MutationObserver. This ensures that dynamically created elements have the necessary authentication context.