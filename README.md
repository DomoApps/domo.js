# ryuu.js (domo.js)

> **Prerequisites:**
> Basic JavaScript knowledge is required. If you're new to JavaScript, review a tutorial before using ryuu.js.

---

## Quick Start

Get started with ryuu.js in just a few lines:

```js
// Import as ES module
import Domo from 'ryuu.js';

// Or include via script tag
// <script src="https://unpkg.com/ryuu.js"></script>

// Fetch data from a dataset
const data = await Domo.get('/data/v1/sales');
console.log(data); // Logs the dataset rows

// Listen for dataset updates
Domo.onDataUpdated((alias) => { 
  console.log(`Dataset ${alias} was updated`);
});
```

---

## Installation

Install with npm:
```sh
npm install ryuu.js
```

Then import in your application:
```js
// ES modules
import Domo from 'ryuu.js';

// CommonJS
const Domo = require('ryuu.js').default;
```

Or add via script tag:
```html
<script src="https://unpkg.com/ryuu.js"></script>
<!-- Domo will be available globally -->
```

---

## API Overview

The `Domo` class provides a comprehensive API for interacting with the Domo platform:

- **HTTP Methods:** Fetch and modify data (`get`, `getAll`, `post`, `put`, `delete`, `domoHttp`)
- **Navigation:** Change the current Domo page (`navigate`)
- **Environment:** Access app and user context (`env`)
- **Filters:** Listen for and set page filters (`onFiltersUpdated`, `requestFiltersUpdate`)
- **Variables:** Listen for and update page variables (`onVariablesUpdated`, `requestVariablesUpdate`)
- **App Data:** Listen for and send custom app data (`onAppDataUpdated`, `requestAppDataUpdate`)
- **Events:** Listen for dataset changes (`onDataUpdated`)
- **Utilities:** Helper functions and extension capabilities (`extend`, `__util`)

---

## Deprecated Methods

> **Migration Guide:**
> The following methods are deprecated for consistency and clarity. Please use the new names for future compatibility.

- `Domo.onDataUpdate` → `Domo.onDataUpdated` — Listen for dataset changes
- `Domo.onFiltersUpdate` → `Domo.onFiltersUpdated` — Listen for filter changes  
- `Domo.onAppData` → `Domo.onAppDataUpdated` — Listen for app data changes
- `Domo.filterContainer` → `Domo.requestFiltersUpdate` — Set page filters
- `Domo.sendVariables` → `Domo.requestVariablesUpdate` — Update page variables
- `Domo.sendAppData` → `Domo.requestAppDataUpdate` — Send custom app data

> Update your code to use the new method names for a more consistent and future-proof API.

---

## Usage

## Usage

Once installed, use the `Domo` class to interact with the Domo platform from your custom app.

### HTTP Methods

#### Domo.get()

Fetch data from a Domo dataset or endpoint. Returns a Promise with the data.

```js
// Basic usage - returns array of objects by default
const data = await Domo.get('/data/v1/sales');
console.log(data); // See the Data API documentation for data structure
```

<!-- theme: info -->
> **Best Practice:**
> Always filter and paginate data to avoid slow responses or app crashes. See the [Getting Data Guide](../Guides/getting-data.md) for details.

You can specify the data format:

```js
// Get data as CSV string
const csvData = await Domo.get('/data/v1/sales', { format: 'csv' });

// Get data as array of arrays with metadata
const arrayData = await Domo.get('/data/v1/sales', { format: 'array-of-arrays' });
console.log(arrayData.columns); // Column names
console.log(arrayData.rows);    // Data rows
```

Supported formats:
- `array-of-objects` (default)
- `array-of-arrays`
- `csv` - Returns CSV string
- `excel` - Returns Excel blob

#### Domo.getAll()

Fetch multiple datasets/endpoints in parallel. Returns a Promise with an array of results.

```js
const [sales, inventory, customers] = await Domo.getAll([
  '/data/v1/sales', 
  '/data/v1/inventory',
  '/data/v1/customers'
]);
```

You can also specify options for all requests:

```js
const results = await Domo.getAll(
  ['/data/v1/sales', '/data/v1/inventory'], 
  { format: 'csv' }
);
```

#### Domo.post()

Send a POST request with data. Takes a URL, request body, and optional options.

```js
// Create a new document in Domo DataStore
const result = await Domo.post(
  '/domo/datastores/v1/collections/Users/documents/', 
  { name: 'John Doe', role: 'Admin' }
);
```

#### Domo.put()

Send a PUT request to update data. Takes a URL, request body, and optional options.

```js
// Update an existing document
const result = await Domo.put(
  '/domo/datastores/v1/collections/Users/documents/abc123',
  { name: 'Jane Doe', role: 'Manager' }
);
```

#### Domo.delete()

Send a DELETE request. Takes a URL and optional options.

```js
// Delete a document
const result = await Domo.delete('/domo/datastores/v1/collections/Users/documents/abc123');
```

#### Domo.domoHttp()

Low-level HTTP method that all other HTTP methods use internally. Provides full control over the request.

```js
import { RequestMethods } from 'ryuu.js';

const result = await Domo.domoHttp(
  RequestMethods.PATCH,
  '/custom/endpoint',
  { format: 'array-of-objects' },
  { data: 'custom body' }
);
```

### Navigation

Change the current Domo page programmatically.

```js
// Navigate to a different page in Domo
Domo.navigate('/profile/3234');
```

To open in a new tab/window:
```js
Domo.navigate('/profile/3234', true);
```

> **Note:**
> Use `Domo.navigate` instead of HTML links to change the page hosting the Custom App.

#### Mobile Web

For mobile web platforms, routes are prefixed with `/m#`. For example: `/m#/profile/3234`.

#### External Links

> For security reasons, Custom Apps can link only to approved, whitelisted domains. You can whitelist domains in "Admin" > "Network Security" > "Custom Apps authorized domains". Contact your Domo administrator if you need to link to external domains.

### Environment

Access context about the current user, customer, and app environment via `Domo.env`.

```js
// Access environment information
console.log(Domo.env.pageId);     // Current page ID
console.log(Domo.env.userId);     // Current user ID  
console.log(Domo.env.customer);   // Customer name
console.log(Domo.env.locale);     // Locale (e.g., 'en-US')
console.log(Domo.env.environment); // Environment (e.g., 'dev3')
console.log(Domo.env.platform);   // Platform (e.g., 'desktop')
```

Common environment properties:
- `pageId` — Current page ID
- `userId` — Current user ID
- `customer` — Customer name
- `locale` — Locale (e.g., 'en-US')
- `environment` — Environment (e.g., 'dev3')
- `platform` — Platform (e.g., 'desktop', 'mobile')

> **Security Note:**
> These properties are populated from URL parameters and can be spoofed. For secure user information, always verify with the API:

```js
const authenticatedUser = await Domo.get('/domo/environment/v1/');
```

### Event Handling & Data Updates

#### Domo.onDataUpdated()

Register a callback for when datasets change. Useful for handling data updates without a full page refresh.

```js
Domo.onDataUpdated((datasetAlias) => {
  console.log(`Dataset ${datasetAlias} was updated`);
  // Refresh your visualization or reload data
});
```

The callback receives:
- `datasetAlias` (string) — The alias of the dataset that was updated

#### Domo.onFiltersUpdated()

Register a callback for when page filters change.

```js
Domo.onFiltersUpdated((filters) => {
  console.log('Filters updated:', filters);
  // Apply filters to your data visualization
});
```

The callback receives:
- `filters` (array) — Array of filter objects with the following structure:

```js
// Example filter structure
{
  column: "category",           // Column name being filtered
  operator: "IN",              // Filter operator (see below for full list)
  values: ["ALERT", "WARNING"], // Array of filter values
  dataType: "STRING",          // Data type: "STRING", "NUMERIC", "DATE", "DATETIME"
  dataSourceId: "46d91556-...", // Source dataset ID
  label: "category"            // Display label
}
```

#### Domo.requestFiltersUpdate()

Programmatically set or update page filters.

```js
Domo.requestFiltersUpdate([
  {
    column: 'category',
    operator: 'IN', 
    values: ['ALERT', 'WARNING'],
    dataType: 'STRING'
  },
  {
    column: 'amount',
    operator: 'GREATER_THAN',
    values: [1000],
    dataType: 'NUMERIC'
  }
]);
```

Filter properties:
- `column` (string, required) — Column name to filter on
- `operator` (string, required) — Filter operator (see supported operators below)
- `values` (array, required) — Values to filter by
- `dataType` (string, required) — Data type: `"STRING"`, `"NUMERIC"`, `"DATE"`, `"DATETIME"`

Supported operators:
- **String operators:** `"IN"`, `"NOT_IN"`, `"CONTAINS"`, `"NOT_CONTAINS"`, `"STARTS_WITH"`, `"NOT_STARTS_WITH"`, `"ENDS_WITH"`, `"NOT_ENDS_WITH"`
- **Numeric/Date operators:** `"EQUALS"`, `"NOT_EQUALS"`, `"GREATER_THAN"`, `"GREAT_THAN_EQUALS_TO"`, `"LESS_THAN"`, `"LESS_THAN_EQUALS_TO"`, `"BETWEEN"`

#### Domo.onVariablesUpdated()

Register a callback for when page variables change.

```js
Domo.onVariablesUpdated((variables) => {
  console.log('Variables updated:', variables);
  // Use updated variables in your app logic
});
```

The callback receives:
- `variables` (object) — Object with variable IDs as keys:

```js
// Example variables structure
{
  "391": {
    "parsedExpression": {
      "exprType": "NUMERIC_VALUE", 
      "value": "9"
    }
  }
}
```

> **Note:**
> Variable IDs (like "391") are defined by Domo. You'll need to inspect the variables object to find the correct IDs for your use case.

#### Domo.requestVariablesUpdate()

Update page variables programmatically.

```js
Domo.requestVariablesUpdate([
  {
    "functionId": 123,
    "value": 1
  }
]);
```

#### Domo.onAppDataUpdated() 

Register a callback for when custom app data changes.

```js
Domo.onAppDataUpdated((data) => {
  console.log('App data updated:', data);
  // Handle custom app data updates
});
```

#### Domo.requestAppDataUpdate()

Send custom app data to other components or apps on the same page.

```js
Domo.requestAppDataUpdate({ 
  customKey: 'customValue',
  timestamp: Date.now()
});
```

### Advanced Features

#### Domo.extend()

Extend or override static methods and properties of the Domo class for custom behavior.

```js
import Domo, { get as originalGet } from 'ryuu.js';

// Override the get method with custom logic
Domo.extend({
  get: async (url, options) => {
    console.log(`Fetching data from: ${url}`);
    const result = await originalGet(url, options);
    console.log(`Retrieved ${result.length} records`);
    return result;
  }
});

// Now all calls to Domo.get() will use the extended version
const data = await Domo.get('/data/v1/sales');
```

---

## Error Handling

All HTTP methods return Promises. Use try/catch with async/await to handle errors:

```js
try {
  const data = await Domo.get('/data/v1/sales');
  console.log('Data loaded successfully:', data);
} catch (error) {
  console.error('Failed to load data:', error);
  
  // Check specific error properties
  if (error.status === 404) {
    console.log('Dataset not found');
  } else if (error.status === 403) {
    console.log('Access denied');
  }
}
```

Error objects include:
- `message` — Error description
- `status` — HTTP status code (if applicable)
- `statusText` — HTTP status text
- `body` — Response body
- `headers` — Response headers

---

## TypeScript Support

ryuu.js includes full TypeScript definitions. Import types for better development experience:

```typescript
import Domo, { 
  RequestOptions, 
  ObjectResponseBody, 
  ArrayResponseBody,
  Filter 
} from 'ryuu.js';

// Typed request options
const options: RequestOptions<'array-of-objects'> = {
  format: 'array-of-objects'
};

// Typed response
const data: ObjectResponseBody[] = await Domo.get('/data/v1/sales', options);

// Typed filters
const filters: Filter[] = [
  {
    column: 'category',
    operator: 'IN',
    values: ['ALERT'],
    dataType: 'STRING'
  }
];
```

## Complete Example

Here's a complete example showing how to build a simple dashboard with ryuu.js:

```js
import Domo from 'ryuu.js';

class DashboardApp {
  constructor() {
    this.initializeEventListeners();
    this.loadInitialData();
  }

  initializeEventListeners() {
    // Listen for data updates
    Domo.onDataUpdated((datasetAlias) => {
      console.log(`Refreshing data for ${datasetAlias}`);
      this.loadInitialData();
    });

    // Listen for filter changes
    Domo.onFiltersUpdated((filters) => {
      console.log('Filters changed:', filters);
      this.applyFilters(filters);
    });

    // Listen for variable changes
    Domo.onVariablesUpdated((variables) => {
      console.log('Variables updated:', variables);
      this.updateConfig(variables);
    });
  }

  async loadInitialData() {
    try {
      // Load multiple datasets in parallel
      const [sales, customers, products] = await Domo.getAll([
        '/data/v1/sales',
        '/data/v1/customers', 
        '/data/v1/products'
      ]);

      this.renderDashboard({ sales, customers, products });
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError('Unable to load dashboard data');
    }
  }

  applyFilters(filters) {
    // Apply filters to your visualizations
    const categoryFilter = filters.find(f => f.column === 'category');
    if (categoryFilter) {
      this.filterByCategory(categoryFilter.values);
    }
  }

  filterByCategory(categories) {
    // Update page filters programmatically
    Domo.requestFiltersUpdate([
      {
        column: 'category',
        operator: 'IN',
        values: categories,
        dataType: 'STRING'
      }
    ]);
  }

  async exportData() {
    try {
      // Export data as CSV
      const csvData = await Domo.get('/data/v1/sales', { format: 'csv' });
      this.downloadFile(csvData, 'sales-data.csv');
    } catch (error) {
      console.error('Export failed:', error);
    }
  }

  navigateToDetails(id) {
    // Navigate to detail page
    Domo.navigate(`/sales/detail/${id}`);
  }

  renderDashboard(data) {
    // Render your dashboard with the loaded data
    console.log('Rendering dashboard with data:', data);
  }

  showError(message) {
    // Show error message to user
    console.error(message);
  }

  updateConfig(variables) {
    // Update app configuration based on variables
    const themeVar = variables['123'];
    if (themeVar) {
      this.setTheme(themeVar.parsedExpression.value);
    }
  }

  setTheme(theme) {
    document.body.className = `theme-${theme}`;
  }

  downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Initialize the app
new DashboardApp();
```

---

## Contributing

Contributions are welcome! Please open issues or pull requests on GitHub.

---

## License

MIT License. See [LICENSE](./LICENSE) for details.