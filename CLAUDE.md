# CLAUDE.md - Development Guide for AI Assistance

This document provides comprehensive information about the domo.js/ryuu.js codebase architecture, implementation patterns, and internal workings. It is specifically designed to help AI assistants (like Claude) understand and work effectively with this codebase.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Core Components](#core-components)
5. [Communication Patterns](#communication-patterns)
6. [Type System](#type-system)
7. [Services Layer](#services-layer)
8. [Utilities Layer](#utilities-layer)
9. [Mobile Integration](#mobile-integration)
10. [Design Patterns & Conventions](#design-patterns--conventions)
11. [Testing Strategy](#testing-strategy)
12. [Build & Development](#build--development)
13. [Common Development Tasks](#common-development-tasks)

---

## Project Overview

**Name:** ryuu.js (published name) / domo.js (development name)
**Purpose:** JavaScript SDK for developing custom applications within the Domo platform
**Version:** 5.1.3
**Package:** Published as `ryuu.js` on npm

### What This Library Does

ryuu.js enables developers to build custom applications (iframed web apps) that run within the Domo platform. The library provides:

1. **Bidirectional Communication**: Facilitates message passing between the custom app (child iframe) and the Domo platform (parent window)
2. **HTTP API Access**: Authenticated requests to Domo APIs (datasets, datastores, environment, etc.)
3. **Event System**: Real-time updates for dataset changes, filter updates, and variable changes
4. **Mobile Support**: Cross-platform compatibility with iOS and Android mobile apps using platform-specific APIs
5. **Type Safety**: Full TypeScript support with comprehensive type definitions

### Key Technical Decisions

- **Zero Runtime Dependencies**: Minimizes bundle size and avoids dependency conflicts
- **Fetch API**: Modern replacement for XMLHttpRequest
- **MessageChannel**: Primary communication mechanism (more reliable than postMessage alone)
- **Static Class Pattern**: No instantiation required, all methods are static
- **MutationObserver**: Automatic token injection into DOM for seamless authentication

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Parent Window                             │
│              (Domo Platform/Mobile App)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Custom App (iframe)                      │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │         Public API (Domo class)              │    │   │
│  │  │  - HTTP methods, events, navigation          │    │   │
│  │  └───────────────────┬──────────────────────────┘    │   │
│  │                      ↓                                │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │         Services Layer                       │    │   │
│  │  │  HTTP | Filters | Variables | AppData       │    │   │
│  │  │  Dataset | Navigation                        │    │   │
│  │  └───────────────────┬──────────────────────────┘    │   │
│  │                      ↓                                │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │         Utilities Layer                      │    │   │
│  │  │  Validation | Headers | DOM | Type Guards    │    │   │
│  │  └───────────────────┬──────────────────────────┘    │   │
│  │                      ↓                                │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │    Models (Interfaces, Enums, Types)         │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│              MessageChannel / postMessage                    │
│              webkit.messageHandlers (iOS)                    │
│              window.domovariable (Android)                   │
└─────────────────────────────────────────────────────────────┘
```

### Communication Flow

**Desktop/Web:**
```
Custom App (iframe)
    ↕ MessageChannel (Port1 ↔ Port2)
Parent Window (Domo Platform)
```

**Mobile:**
```
Custom App (WebView)
    ↕ webkit.messageHandlers (iOS) OR window.domovariable/domofilter (Android)
Native Mobile App (iOS/Android)
    ↕ Platform-specific bridge
Parent Window (Domo Platform)
```

### Request-Reply Pattern

The library implements an acknowledgment-based async communication pattern:

1. **ASK**: App sends a request to parent with unique ID
2. **ACK**: Parent acknowledges receipt (optional callback)
3. **REPLY**: Parent sends response with matching ID (completion callback)

This pattern enables reliable async operations with status tracking via `Domo.getRequests()`.

---

## Directory Structure

```
src/
├── index.ts                          # Entry point - exports all public APIs
├── domo.ts                          # Core Domo class implementation
├── domo.test.ts                     # Domo class unit tests
│
├── types/
│   └── global.d.ts                  # Global TypeScript declarations (mobile)
│
├── models/
│   ├── constants/
│   │   └── general.ts               # DomoEvent, eventToListenerMap, getToken
│   │
│   ├── enums/
│   │   ├── askReply.ts              # EventType (ASK, ACK, REPLY)
│   │   ├── data-formats.ts          # DataFormats enum
│   │   ├── domo-data-types.ts       # DomoDataTypes enum
│   │   └── request-methods.ts       # RequestMethods enum
│   │
│   ├── interfaces/
│   │   ├── ask-reply.ts             # AskReplyMap interface
│   │   ├── filter.ts                # Filter types and operators
│   │   ├── json.ts                  # Json type definitions
│   │   ├── request.ts               # Request/Response interfaces
│   │   └── variable.ts              # Variable interface
│   │
│   └── services/
│       ├── appdata.ts               # App data communication
│       ├── dataset.ts               # Dataset update events
│       ├── filters.ts               # Filter management
│       ├── http.ts                  # HTTP request service (CORE)
│       ├── navigation.ts            # Navigation service
│       └── variables.ts             # Variable management
│
└── utils/
    ├── ask-reply.ts                 # Request tracking utilities
    ├── data-helpers.ts              # Format conversion
    ├── domoutils.ts                 # DOM and header utilities
    ├── filter.ts                    # Filter validation
    ├── general.ts                   # General utilities
    └── variable.ts                  # Variable validation
```

### File Organization Rationale

- **models/**: Pure data structures - interfaces, enums, types, constants
- **services/**: Business logic - communication, event handling, HTTP operations
- **utils/**: Helper functions - validation, conversion, DOM manipulation
- **types/**: Global type declarations - environment-specific typings

---

## Core Components

### The Domo Class

Location: [src/domo.ts](src/domo.ts)

The `Domo` class is the main entry point and only public-facing class. It's a static class (no instantiation required).

#### Key Properties

```typescript
class Domo {
  // Communication
  static channel?: MessageChannel;
  static connected: boolean = false;

  // Request tracking
  private static requests: AskReplyMap = {};

  // Event listeners registry
  static listeners: { [index: string]: Function[] } = {
    [DomoEvent.DATA_UPDATED]: [],
    [DomoEvent.FILTERS_UPDATED]: [],
    [DomoEvent.VARIABLES_UPDATED]: [],
    [DomoEvent.APP_DATA]: []
  };

  // Environment info (from URL query params)
  static env: QueryParams;

  // Internal utilities (exposed for advanced use)
  static __util: {
    isSuccess,
    isVerifiedOrigin,
    getQueryParams,
    setFormatHeaders
  };
}
```

#### Initialization Flow

1. **Lazy Initialization**: `connect()` is called when first event listener is registered
2. **MessageChannel Creation**: Creates channel with two ports
3. **Subscribe Message**: Posts 'subscribe' message with port2 to parent (includes `skipFilters` flag)
4. **Dual Message Handlers**:
   - **MessageChannel listener**: Handles modern communication via `port1.onmessage`
   - **Legacy window.postMessage listener**: Maintains backward compatibility with v4.7.0 and earlier
5. **Origin Verification**: Legacy handler uses `isVerifiedOrigin()` for security
6. **Event Dispatching**: Both handlers map events to appropriate service handlers

See [src/domo.ts:118-228](src/domo.ts#L118-L228) for the `connect()` implementation.

#### Methods Overview

**HTTP Methods** (see [Services Layer](#services-layer)):
- `get(url, options?)` - GET request
- `getAll(urls[], options?)` - Parallel GET requests
- `post(url, body?, options?)` - POST request
- `put(url, body?, options?)` - PUT request
- `delete(url, options?)` - DELETE request
- `domoHttp(method, url, options?, body?)` - Low-level HTTP

**Event Listeners** (return unsubscribe function):
- `onDataUpdated(callback)` - Dataset updates
- `onFiltersUpdated(callback)` - Filter changes
- `onVariablesUpdated(callback)` - Variable changes
- `onAppDataUpdated(callback)` - Custom app data

**Emitters** (send to parent):
- `requestFiltersUpdate(filters, pageStateUpdate?, onAck?, onReply?)` - Update filters
- `requestVariablesUpdate(variables, onAck?, onReply?)` - Update variables
- `requestAppDataUpdate(appData, onAck?, onReply?)` - Send app data
- `navigate(url, isNewWindow?)` - Navigate to page

**Utilities**:
- `env` - Environment query parameters
- `extend(overrides)` - Override static methods/properties
- `getRequests()` - Get all tracked requests
- `getRequest(id)` - Get specific request by ID

#### Deprecated Methods

These methods still exist for backward compatibility but redirect to new names:

- `onDataUpdate` → `onDataUpdated`
- `onFiltersUpdate` → `onFiltersUpdated`
- `onAppData` → `onAppDataUpdated`
- `filterContainer` → `requestFiltersUpdate`
- `sendVariables` → `requestVariablesUpdate`
- `sendAppData` → `requestAppDataUpdate`

See [src/domo.ts:330-345](src/domo.ts#L330-L345) for deprecation implementations.

---

## Communication Patterns

### MessageChannel Communication

**Setup Process:**

1. App creates `MessageChannel` with two ports
2. App posts 'subscribe' message to parent with `port2` via `postMessage`
3. Parent receives port2 and stores it for future communication
4. Parent sends messages to app via port2
5. App receives messages on port1

**Code Location:** [src/domo.ts:250-284](src/domo.ts#L250-L284)

### Message Structure

All messages follow this structure:

```typescript
{
  event: string,           // Event name (e.g., 'filtersUpdated')
  eventType?: EventType,   // ASK, ACK, or REPLY
  requestId?: string,      // Unique ID for request tracking
  data?: any              // Payload
}
```

### Event Types

Defined in [src/models/enums/askReply.ts](src/models/enums/askReply.ts):

- **ASK**: Initial request from app to parent
- **ACK**: Acknowledgment from parent (request received)
- **REPLY**: Final response from parent (request completed)

### Communication Methods

#### From Parent to App (Received):

1. **Data Updated**: `{ event: 'dataUpdated', data: datasetAlias }`
2. **Filters Updated**: `{ event: 'filtersUpdated', data: filters[] }`
3. **Variables Updated**: `{ event: 'variablesUpdated', data: variables }`
4. **App Data Updated**: `{ event: 'appData', data: appData }`
5. **Acknowledgment**: `{ event: 'ack', eventType: 'ACK', requestId }`
6. **Reply**: `{ event: eventName, eventType: 'REPLY', requestId, data }`

#### From App to Parent (Sent):

1. **Request Filters Update**: `{ event: 'filtersUpdate', eventType: 'ASK', requestId, data: filters }`
2. **Request Variables Update**: `{ event: 'variablesUpdate', eventType: 'ASK', requestId, data: variables }`
3. **Request App Data Update**: `{ event: 'appData', eventType: 'ASK', data: appData }`
4. **Navigate**: `{ event: 'navigate', data: { route, isNewWindow } }`

### Request Tracking

The library tracks all ASK-type requests in `Domo.requests`:

```typescript
interface AskReplyMap {
  [requestId: string]: {
    request: AskRequestStatus;  // { status: 'PENDING' | 'SENT', timestamp }
    response?: AskResponseStatus; // { status: 'SUCCESS' | 'FAILURE', timestamp, data }
  }
}
```

**Workflow:**

1. App calls `requestFiltersUpdate(filters, true, onAck, onReply)`
2. Request stored with unique ID, status 'pending', and callbacks
   ```typescript
   this.requests[requestId] = {
     request: {
       payload: message,
       onAck,
       onReply,
       status: "pending",
       sentAt: Date.now()
     }
   };
   ```
3. Message sent to parent (via postMessage or mobile bridge)
4. Status remains 'pending' until acknowledgment
5. Parent sends ACK → `handleAck()` invokes stored `onAck()` callback
6. Parent sends REPLY → `handleReply()` invokes stored `onReply(data)` callback
7. Response stored in requests map with success/error data

**Callback Support:**
- `onAck`: Called when parent acknowledges receipt (request processed)
- `onReply`: Called when operation completes with result data
- Both callbacks are optional - supports `() => void` or `() => null` patterns

See [src/utils/ask-reply.ts](src/utils/ask-reply.ts) for implementation.

---

## Type System

### Core Interfaces

#### Filter Interface

Location: [src/models/interfaces/filter.ts](src/models/interfaces/filter.ts)

```typescript
interface Filter {
  column: string;
  operator: FilterOperatorsString | FilterOperatorsNumeric;
  values: any[];
  dataType: FilterDataTypes;
  dataSourceId?: string;
  label?: string;
}

type FilterOperatorsString =
  | 'IN' | 'NOT_IN'
  | 'CONTAINS' | 'NOT_CONTAINS'
  | 'STARTS_WITH' | 'NOT_STARTS_WITH'
  | 'ENDS_WITH' | 'NOT_ENDS_WITH';

type FilterOperatorsNumeric =
  | 'EQUALS' | 'NOT_EQUALS'
  | 'GREATER_THAN' | 'GREAT_THAN_EQUALS_TO'
  | 'LESS_THAN' | 'LESS_THAN_EQUALS_TO'
  | 'BETWEEN';

type FilterDataTypes = 'STRING' | 'NUMERIC' | 'DATE' | 'DATETIME';
```

#### Variable Interface

Location: [src/models/interfaces/variable.ts](src/models/interfaces/variable.ts)

```typescript
interface Variable {
  functionId: number;
  value: any;
}
```

#### Request/Response Interfaces

Location: [src/models/interfaces/request.ts](src/models/interfaces/request.ts)

```typescript
// Request options with format-specific typing
interface RequestOptions<F extends DomoDataFormats = 'array-of-objects'> {
  format?: F;
  query?: { [key: string]: any };
  contentType?: string;
  fetchImpl?: typeof fetch;
}

// Response body types (format-specific)
type ObjectResponseBody = { [key: string]: any };

interface ArrayResponseBody {
  datasource: string;
  metadata: Array<{ type: DomoDataTypes }>;
  columns: string[];
  rows: any[][];
  numRows: number;
  numColumns: number;
  fromcache: boolean;
}

type ResponseBody<F extends DomoDataFormats> =
  F extends 'array-of-arrays' ? ArrayResponseBody :
  F extends 'csv' ? string :
  F extends 'excel' ? Blob :
  F extends 'plain' ? string :
  ObjectResponseBody[];
```

**Key Design:** Conditional types enable format-specific return types. When you call `Domo.get(url, { format: 'csv' })`, TypeScript knows the return type is `string`.

### Enums

#### DataFormats

Location: [src/models/enums/data-formats.ts](src/models/enums/data-formats.ts)

```typescript
enum DataFormats {
  ARRAY_OF_OBJECTS = 'array-of-objects',
  JSON = 'array-of-arrays',
  CSV = 'csv',
  EXCEL = 'excel',
  PLAIN = 'plain'
}
```

**Note:** `JSON` enum value maps to 'array-of-arrays' format string (historical naming).

#### DomoDataTypes

Location: [src/models/enums/domo-data-types.ts](src/models/enums/domo-data-types.ts)

```typescript
enum DomoDataTypes {
  STRING = 'STRING',
  LONG = 'LONG',
  DECIMAL = 'DECIMAL',
  DOUBLE = 'DOUBLE',
  DATE = 'DATE',
  DATETIME = 'DATETIME'
}
```

#### RequestMethods

Location: [src/models/enums/request-methods.ts](src/models/enums/request-methods.ts)

```typescript
enum RequestMethods {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE'
}
```

### Type Guards

Type guards narrow TypeScript types and validate runtime values.

#### Filter Type Guards

Location: [src/utils/filter.ts](src/utils/filter.ts)

```typescript
function isFilter(filter: any): filter is Filter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    typeof filter.column === 'string' &&
    typeof filter.operator === 'string' &&
    Array.isArray(filter.values) &&
    typeof filter.dataType === 'string'
  );
}

function isFilterArray(filters: any): filters is Filter[] {
  return Array.isArray(filters) && filters.every(isFilter);
}

function guardAgainstInvalidFilters(filters: any): void {
  if (!isFilterArray(filters)) {
    throw new TypeError(
      'Invalid filters: expected array of Filter objects with column, operator, values, and dataType'
    );
  }
}
```

#### Variable Type Guards

Location: [src/utils/variable.ts](src/utils/variable.ts)

Similar pattern for Variable validation.

**Usage Pattern:**

```typescript
// In service functions
export function requestFiltersUpdate(filters: Filter[]) {
  guardAgainstInvalidFilters(filters); // Throws if invalid
  // Proceed with valid filters
}
```

---

## Services Layer

Services implement the core business logic and are bound to the Domo class via `this` context.

### HTTP Service

Location: [src/models/services/http.ts](src/models/services/http.ts)

The HTTP service is the most critical component, handling all API requests.

#### Key Functions

**domoHttp** (Low-level HTTP):

```typescript
function domoHttp<F extends DomoDataFormats = 'array-of-objects'>(
  method: RequestMethods,
  url: string,
  options?: RequestOptions<F>,
  body?: RequestBody
): Promise<ResponseBody<F>>
```

**Implementation Details:**

1. **Format Header Setup**: Converts user-facing format to Accept header
2. **Auth Token**: Retrieves `__RYUU_SID__` token and adds to headers
3. **Fetch Request**: Uses native fetch or custom implementation
4. **Response Processing**: Parses response based on format
5. **Error Handling**: Throws detailed error objects

See [src/models/services/http.ts:122-186](src/models/services/http.ts#L122-L186) for implementation.

**Overloaded Functions:**

```typescript
// Format-specific overloads for type safety
function get<F extends DomoDataFormats>(
  url: string,
  options: RequestOptions<F>
): Promise<ResponseBody<F>>;

function get(url: string): Promise<ObjectResponseBody[]>;
```

This enables TypeScript to infer correct return types:

```typescript
const objects = await Domo.get('/data/v1/sales'); // ObjectResponseBody[]
const csv = await Domo.get('/data/v1/sales', { format: 'csv' }); // string
const arrays = await Domo.get('/data/v1/sales', { format: 'array-of-arrays' }); // ArrayResponseBody
```

#### getAll Implementation

Parallel requests using `Promise.all`:

```typescript
function getAll<F extends DomoDataFormats = 'array-of-objects'>(
  urls: string[],
  options?: RequestOptions<F>
): Promise<ResponseBody<F>[]> {
  return Promise.all(urls.map(url => get.call(this, url, options)));
}
```

### Filters Service

Location: [src/models/services/filters.ts](src/models/services/filters.ts)

#### requestFiltersUpdate

Sends filter update request to parent (and mobile platforms).

```typescript
function requestFiltersUpdate(
  filters: Filter[],
  pageStateUpdate: boolean = true,
  onAck?: () => void,
  onReply?: (data: any) => void
): string
```

**Implementation:**

1. **Validation**: `guardAgainstInvalidFilters(filters)`
2. **Request Tracking**: Generates unique ID, stores in `this.requests` with onAck/onReply callbacks
3. **Mobile Detection**: Uses `isMobile()` to detect iOS/Android devices
4. **Platform-Specific Sending**:
   - **Web (desktop)**: Posts to `window.parent` via postMessage
   - **Mobile**: Tries `domofilter.postMessage()` first, then falls back to:
     - iOS: `webkit.messageHandlers.domofilter.postMessage()`
     - Other: `window.parent.postMessage()`
5. **Returns**: Request ID for tracking

See [src/models/services/filters.ts](src/models/services/filters.ts).

#### onFiltersUpdated

Registers callback for filter changes. When the first listener is registered, automatically sends an initial filter request.

```typescript
function onFiltersUpdated(callback: (filters?: Filter[]) => unknown): () => void
```

**Returns**: Unsubscribe function to remove listener.

**Implementation:**

```typescript
const hasHandlers = this.listeners.onFiltersUpdated.length > 0;

this.connect(); // Ensure MessageChannel is initialized
this.listeners.onFiltersUpdated.push(callback);

// If this is the first listener, request initial filters
if (!hasHandlers) {
  this.requestFiltersUpdate(null, false);
}

// Return unsubscribe function
return () => {
  const index = this.listeners.onFiltersUpdated.indexOf(callback);
  if (index >= 0) {
    this.listeners.onFiltersUpdated.splice(index, 1);
  }
};
```

**Key Behavior:** The first listener triggers an initial filter request to populate the app with current filter state.

#### handleFiltersUpdated

Internal handler that processes incoming filter messages and invokes callbacks. Also handles acknowledgments and reply tracking.

```typescript
function handleFiltersUpdated(message: any, responsePort?: MessagePort): void {
  if (!message) return;

  // Send acknowledgment back through response port if available
  if (this.listeners.onFiltersUpdated.length) {
    responsePort?.postMessage({
      requestId: message.requestId,
      event: "ack",
      filters: message.filters
    });

    // Invoke all registered callbacks
    this.listeners.onFiltersUpdated.forEach((cb: Function) =>
      cb(message.filters)
    );
  }

  // Handle reply for request tracking
  this.handleReply(message.requestId, message.filters, message.error);
}
```

**Key Features:**
- Accepts optional `responsePort` for MessageChannel acknowledgments
- Automatically sends ACK message when callbacks exist
- Processes reply for request tracking (onAck/onReply callbacks)

### Variables Service

Location: [src/models/services/variables.ts](src/models/services/variables.ts)

Similar pattern to Filters service:

- `requestVariablesUpdate(variables, onAck?, onReply?)` - Send updates
- `onVariablesUpdated(callback)` - Listen for changes
- `handleVariablesUpdated(variables)` - Internal handler

**Mobile Integration:**
- Tries `domovariable.postMessage()` first (global object injected by mobile apps)
- Falls back to `webkit.messageHandlers.domovariable.postMessage()` for iOS
- Falls back to `window.parent.postMessage()` for other platforms

### Dataset Service

Location: [src/models/services/dataset.ts](src/models/services/dataset.ts)

Handles dataset update events:

- `onDataUpdated(callback)` - Register listener for dataset changes
- `handleDataUpdated(datasetAlias)` - Internal handler

**Use Case:** When a dataset backing your app is updated in Domo, your app receives notification to refresh data without page reload.

### AppData Service

Location: [src/models/services/appdata.ts](src/models/services/appdata.ts)

Custom data communication between apps on the same page:

- `requestAppDataUpdate(data, onAck?, onReply?)` - Send custom data
- `onAppDataUpdated(callback)` - Listen for custom data
- `handleAppData(data)` - Internal handler

### Navigation Service

Location: [src/models/services/navigation.ts](src/models/services/navigation.ts)

```typescript
function navigate(route: string, isNewWindow: boolean = false): void {
  this.channel?.port1.postMessage({
    event: 'navigate',
    data: { route, isNewWindow }
  });
}
```

Simple message posting to trigger navigation in parent window.

---

## Utilities Layer

### General Utilities

Location: [src/utils/general.ts](src/utils/general.ts)

#### isSuccess

```typescript
function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}
```

Checks if HTTP status code indicates success.

#### isVerifiedOrigin

```typescript
function isVerifiedOrigin(origin: string): boolean {
  const domoDomains = [
    'domo.com',
    'domolabs.io',
    'domo-dev.com',
    'domo-qa.com',
    'localhost'
  ];

  return domoDomains.some(domain =>
    origin.includes(domain) ||
    origin.startsWith('file://') ||
    origin === 'null'
  );
}
```

Security check for message origin validation. Used to verify messages come from trusted Domo domains.

#### getQueryParams

```typescript
function getQueryParams(): QueryParams {
  const params = new URLSearchParams(window.location.search);
  return {
    userId: params.get('userId'),
    customer: params.get('customer'),
    locale: params.get('locale'),
    // ... all other params
  };
}
```

Parses URL query parameters into `Domo.env` object.

#### generateUniqueId

```typescript
function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
```

Generates request IDs for tracking.

#### isIOS

```typescript
function isIOS(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const hasIOSUserAgent = /(?:iphone|ipad|ipod)/.test(userAgent);
  const isPossibleIPadDesktopMode = /mac os x/.test(userAgent) &&
    'ontouchend' in document &&
    navigator.maxTouchPoints > 1;

  // Additional checks for reliability
  const hasIOSAPIs = webkit?.messageHandlers !== undefined;
  const isStandalone = navigator.standalone === true;
  const hasMobileScreenRatio = screen?.width < 1024;

  return hasIOSUserAgent || isPossibleIPadDesktopMode ||
         ([hasIOSAPIs, isStandalone, hasMobileScreenRatio].filter(Boolean).length >= 2);
}
```

Multi-factor iOS detection with support for iPad desktop mode and enhanced reliability checks.

#### isMobile

```typescript
function isMobile(): boolean {
  if (isIOS()) return true;

  const userAgent = navigator.userAgent.toLowerCase();
  const hasMobileUserAgent = /android|webos|blackberry|iemobile|opera mini|mobile|phone/.test(userAgent);

  if (hasMobileUserAgent) return true;

  // Require multiple indicators for edge cases
  const hasMobileAPIs = window.domovariable !== undefined || window.domofilter !== undefined;
  const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasMobileScreenRatio = screen?.width < 1024;

  return [hasMobileAPIs, hasTouchSupport, hasMobileScreenRatio].filter(Boolean).length >= 2;
}
```

Comprehensive mobile detection covering iOS, Android, and other mobile platforms.

### DOM Utilities

Location: [src/utils/domoutils.ts](src/utils/domoutils.ts)

#### setAuthTokenHeader

```typescript
function setAuthTokenHeader(headers: HeadersInit): HeadersInit {
  const token = getToken();
  if (token) {
    return {
      ...headers,
      'X-DOMO-Authentication': token
    };
  }
  return headers;
}
```

Adds authentication token to request headers.

#### processBody

```typescript
function processBody(body: RequestBody): string {
  return typeof body === 'string' ? body : JSON.stringify(body);
}
```

Serializes request body to JSON if needed.

#### handleNode

```typescript
function handleNode(mutation: MutationRecord): void {
  mutation.addedNodes.forEach(node => {
    if (node.nodeType === 1) { // Element node
      const element = node as Element;
      if (element.tagName === 'SCRIPT' && element.hasAttribute('data-token')) {
        const token = element.getAttribute('data-token');
        window.__RYUU_SID__ = token;
      }
    }
  });
}
```

MutationObserver callback that watches for token injection into DOM. The parent window injects a script tag with `data-token` attribute, and this function captures it.

### Data Helpers

Location: [src/utils/data-helpers.ts](src/utils/data-helpers.ts)

#### domoFormatToRequestFormat

```typescript
function domoFormatToRequestFormat(format: DomoDataFormats): string {
  const formatMap: { [key: string]: string } = {
    'array-of-objects': 'array-of-objects',
    'array-of-arrays': 'array-of-arrays',
    'csv': 'csv',
    'excel': 'excel',
    'plain': 'plain'
  };
  return formatMap[format] || 'array-of-objects';
}
```

Maps user-facing format names to internal format strings.

### Format Headers

```typescript
function setFormatHeaders(
  format: DomoDataFormats,
  headers: HeadersInit
): HeadersInit {
  const acceptHeaders: { [key: string]: string } = {
    'array-of-objects': 'application/json',
    'array-of-arrays': 'application/array-of-arrays',
    'csv': 'text/csv',
    'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'plain': 'text/plain'
  };

  return {
    ...headers,
    'Accept': acceptHeaders[format] || 'application/json'
  };
}
```

Sets appropriate Accept header based on requested format.

---

## Mobile Integration

### iOS Integration

Location: [src/models/services/filters.ts](src/models/services/filters.ts), [src/models/services/variables.ts](src/models/services/variables.ts)

**webkit.messageHandlers API:**

iOS provides native message handlers for bidirectional communication between WebView and native app:

```typescript
// Modern approach (try global object first)
try {
  domofilter.postMessage(JSON.stringify(filters));
} catch (error) {
  // Fallback to webkit handlers
  if (isIOS()) {
    window.webkit?.messageHandlers?.domofilter?.postMessage(filters);
  }
}
```

**Available Handlers:**
- `webkit.messageHandlers.domofilter` - Filter communication
- `webkit.messageHandlers.domovariable` - Variable communication

**Detection:** Uses `isIOS()` which checks:
1. User agent for iPhone/iPad/iPod
2. iPad desktop mode (macOS UA + touch support)
3. Multiple iOS-specific indicators (webkit APIs, standalone mode, screen dimensions)

### Android/Flutter Integration

**Global Objects:**

Android/Flutter apps inject global objects into the WebView that are accessed directly:

```typescript
// Try global object (injected by native mobile apps)
try {
  domovariable.postMessage(JSON.stringify(variables));
} catch (error) {
  // Fallback to window.parent for web or other platforms
  window.parent.postMessage(message, "*");
}

// Similar pattern for filters
try {
  domofilter.postMessage(JSON.stringify(filters));
} catch (error) {
  // Fallback to iOS or web
}
```

**Detection:** Uses `isMobile()` which checks:
1. `isIOS()` first (returns true if iOS)
2. User agent for Android/WebOS/BlackBerry/Mobile
3. Multiple mobile indicators (global APIs, touch support, screen dimensions)

**Type Declarations:**

Location: [src/types/global.d.ts](src/types/global.d.ts)

```typescript
declare global {
  var domovariable: {
    postMessage(message: string): void;
  };

  var domofilter: {
    postMessage(message: string): void;
  };

  interface Window {
    webkit?: {
      messageHandlers?: {
        domofilter?: { postMessage(message: any): void };
        domovariable?: { postMessage(message: any): void };
      };
    };
    domovariable?: { postMessage(message: string): void };
    domofilter?: { postMessage(message: string): void };
  }
}
```

### Platform Detection

The `isIOS()` utility uses multiple checks to reliably detect iOS:

1. Check for webkit.messageHandlers presence
2. Check navigator.platform for iOS devices
3. Fallback to user agent string

This multi-factor approach avoids false positives from browser spoofing.

---

## Design Patterns & Conventions

### 1. Static Class Pattern

All methods are static - no instantiation required:

```typescript
// No: new Domo()
// Yes: Domo.get()
```

**Rationale:**
- Simpler API (no need to create instances)
- Singleton behavior (one connection per app)
- Clean namespace (all methods under Domo.*)

### 2. Observer Pattern

Event listeners use observer pattern with callback registration:

```typescript
const unsubscribe = Domo.onFiltersUpdated((filters) => {
  console.log('Filters updated:', filters);
});

// Later...
unsubscribe(); // Remove listener
```

**Implementation:**
- Listeners stored in `Domo.listeners` object by event name
- Subscription returns unsubscribe function
- Handlers invoke all registered callbacks

### 3. Request-Reply Pattern

Async operations use ASK-ACK-REPLY pattern:

```typescript
Domo.requestFiltersUpdate(
  filters,
  true,
  () => console.log('ACK received'), // onAck callback
  (data) => console.log('REPLY received:', data) // onReply callback
);
```

**Flow:**
1. ASK sent with unique ID
2. ACK received when parent processes request
3. REPLY received when operation completes

### 4. Type Guard Pattern

Validation functions that narrow TypeScript types:

```typescript
function isFilter(filter: any): filter is Filter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    typeof filter.column === 'string' &&
    // ... other checks
  );
}
```

**Benefits:**
- Runtime validation
- Type narrowing for TypeScript
- Reusable validation logic

### 5. Overloaded Functions

Multiple function signatures for type-safe responses:

```typescript
function get<F extends DomoDataFormats>(
  url: string,
  options: RequestOptions<F>
): Promise<ResponseBody<F>>;

function get(url: string): Promise<ObjectResponseBody[]>;
```

TypeScript selects correct overload based on arguments, ensuring return type matches format.

### 6. Decorator Pattern (MutationObserver)

Token injection uses MutationObserver to "decorate" HTTP requests with auth:

```typescript
const observer = new MutationObserver((mutations) => {
  mutations.forEach(handleNode);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
```

Automatically captures auth token without requiring manual intervention.

### 7. Flexible Callback Pattern

Event listeners and emitters support flexible callback signatures:

```typescript
// All of these are valid:
Domo.onFiltersUpdated((filters) => {
  console.log(filters);
});

Domo.onFiltersUpdated(() => {
  // No parameters needed
});

Domo.onFiltersUpdated(() => null); // Explicit null return

// Emitters with optional callbacks
Domo.requestFiltersUpdate(
  filters,
  true,
  () => console.log('Acknowledged'),
  (data) => console.log('Completed:', data)
);

// Or without callbacks
Domo.requestFiltersUpdate(filters);

// Or with only one callback
Domo.requestFiltersUpdate(filters, true, () => console.log('Ack'));
```

**Implementation:** Uses TypeScript's `unknown` return type and `Function` type to allow maximum flexibility while maintaining type safety for parameters.

### Naming Conventions

**Services:**
- Listeners: `on[Event]Updated` (e.g., `onFiltersUpdated`)
- Emitters: `request[Event]Update` (e.g., `requestFiltersUpdate`)
- Handlers: `handle[Event]` (e.g., `handleFiltersUpdated`)

**Utilities:**
- Type Guards: `is[Type]` (e.g., `isFilter`)
- Validation: `guardAgainst[Invalid]` (e.g., `guardAgainstInvalidFilters`)
- Headers: `set[Type]Headers` (e.g., `setAuthTokenHeader`)

**Constants:**
- Enums: PascalCase (e.g., `DataFormats.ARRAY_OF_OBJECTS`)
- Event names: PascalCase with underscores (e.g., `DomoEvent.FILTERS_UPDATED`)

### Error Handling

Comprehensive error objects with context:

```typescript
throw {
  message: 'Request failed',
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
  body: await response.text()
};
```

Provides full context for debugging failed requests.

### Context Binding

Service functions use `this` context, bound to Domo class:

```typescript
// In domo.ts
static get = get.bind(this);
static onFiltersUpdated = onFiltersUpdated.bind(this);
```

Allows services to access `this.channel`, `this.listeners`, etc.

---

## Testing Strategy

### Test Framework

**Jest** with **ts-jest** for TypeScript support.

Configuration: [jest.config.js](jest.config.js)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testMatch: ['**/*.test.ts']
};
```

### Test Structure

Each module has a corresponding `.test.ts` file:

- [src/domo.test.ts](src/domo.test.ts) - Main class tests
- [src/models/services/http.test.ts](src/models/services/http.test.ts) - HTTP service tests
- [src/models/services/filters.test.ts](src/models/services/filters.test.ts) - Filter service tests
- [src/models/services/variables.test.ts](src/models/services/variables.test.ts) - Variable service tests
- [src/models/services/appdata.test.ts](src/models/services/appdata.test.ts) - AppData service tests
- [src/models/services/dataset.test.ts](src/models/services/dataset.test.ts) - Dataset service tests
- [src/models/services/navigation.test.ts](src/models/services/navigation.test.ts) - Navigation service tests
- [src/utils/filter.test.ts](src/utils/filter.test.ts) - Filter utility tests
- [src/utils/general.test.ts](src/utils/general.test.ts) - General utility tests
- [src/utils/domoutils.test.ts](src/utils/domoutils.test.ts) - DOM utility tests
- [src/utils/ask-reply.test.ts](src/utils/ask-reply.test.ts) - Request tracking tests

### Common Test Patterns

#### Mocking MessageChannel

```typescript
const mockPostMessage = jest.fn();
Domo.channel = {
  port1: {
    onmessage: null,
    postMessage: mockPostMessage
  }
} as any;
```

#### Mocking Fetch

```typescript
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([{ id: 1, name: 'Test' }])
  })
) as jest.Mock;
```

#### Testing Event Listeners

```typescript
test('onFiltersUpdated registers callback', () => {
  const callback = jest.fn();
  const unsubscribe = Domo.onFiltersUpdated(callback);

  // Trigger event
  Domo.handleFiltersUpdated([mockFilter]);

  expect(callback).toHaveBeenCalledWith([mockFilter]);

  // Test unsubscribe
  unsubscribe();
  Domo.handleFiltersUpdated([mockFilter]);

  expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
});
```

### Running Tests

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
npm test -- --coverage # Coverage report
```

---

## Build & Development

### Package Configuration

**package.json** key fields:

```json
{
  "name": "ryuu.js",
  "version": "5.1.3",
  "main": "dist/domo.js",
  "types": "dist/domo.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "rm -rf dist && mkdir dist && NODE_ENV=production webpack && cp dist/domo.js demo/domo.js",
    "test": "jest --silent",
    "coverage": "jest --coverage --silent",
    "type-check": "tsc --noEmit",
    "release": "npm run build && npm publish",
    "releaseAlpha": "npm run build && npm publish --tag alpha",
    "releaseBeta": "npm run build && npm publish --tag beta",
    "bumpAlpha": "npm run build && npm run bump -- --prerelease alpha",
    "bumpBeta": "npm run build && npm run bump -- --prerelease beta",
    "bump": "standard-version"
  }
}
```

### Build System

**Webpack 5** configuration: [webpack.config.js](webpack.config.js)

**Key settings:**
- Entry: `src/index.ts`
- Output: `dist/domo.js` (UMD bundle)
- Library: Exposed as `Domo` global
- TypeScript: Compiled with `ts-loader`
- Type Declarations: Generated by TypeScript compiler

### TypeScript Configuration

**tsconfig.json** key settings:

```json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "ESNext",
    "lib": ["ES2015", "DOM"],
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Development Workflow

1. **Install dependencies:** `npm install`
2. **Run tests:** `npm test`
3. **Type check:** `npm run type-check`
4. **Build:** `npm run build`
5. **Test in app:** Copy `dist/domo.js` to custom app project

### Publishing

```bash
npm version patch   # Increment version
npm run build       # Build dist files
npm publish         # Publish to npm
```

**Note:** Published as `ryuu.js`, but developed as `domo.js`.

---

## Common Development Tasks

### Adding a New HTTP Method

1. **Define in RequestMethods enum** (if needed):
   ```typescript
   // src/models/enums/request-methods.ts
   enum RequestMethods {
     PATCH = 'PATCH' // Add new method
   }
   ```

2. **Create service function**:
   ```typescript
   // src/models/services/http.ts
   export function patch<F extends DomoDataFormats = 'array-of-objects'>(
     url: string,
     body?: RequestBody,
     options?: RequestOptions<F>
   ): Promise<ResponseBody<F>> {
     return domoHttp.call(this, RequestMethods.PATCH, url, options, body);
   }
   ```

3. **Add to Domo class**:
   ```typescript
   // src/domo.ts
   static patch = patch.bind(this);
   ```

4. **Export from index**:
   ```typescript
   // src/index.ts
   export { patch } from './models/services/http';
   ```

5. **Add tests**:
   ```typescript
   // src/models/services/http.test.ts
   test('patch sends PATCH request', async () => {
     // Test implementation
   });
   ```

### Adding a New Event Type

1. **Define event constant**:
   ```typescript
   // src/models/constants/general.ts
   export enum DomoEvent {
     NEW_EVENT = 'newEvent'
   }
   ```

2. **Initialize listener array**:
   ```typescript
   // src/domo.ts
   static listeners = {
     [DomoEvent.NEW_EVENT]: []
   };
   ```

3. **Create service functions**:
   ```typescript
   // src/models/services/newevent.ts
   export function onNewEvent(callback: (data: any) => void) {
     this.listeners[DomoEvent.NEW_EVENT].push(callback);
     return () => {
       const index = this.listeners[DomoEvent.NEW_EVENT].indexOf(callback);
       if (index > -1) {
         this.listeners[DomoEvent.NEW_EVENT].splice(index, 1);
       }
     };
   }

   export function handleNewEvent(data: any) {
     this.listeners[DomoEvent.NEW_EVENT].forEach(cb => cb(data));
   }
   ```

4. **Add message handler**:
   ```typescript
   // src/domo.ts, in connect() method
   port1.onmessage = (event) => {
     if (event.data.event === DomoEvent.NEW_EVENT) {
       this.handleNewEvent(event.data.data);
     }
   };
   ```

5. **Bind to Domo class**:
   ```typescript
   // src/domo.ts
   static onNewEvent = onNewEvent.bind(this);
   static handleNewEvent = handleNewEvent.bind(this);
   ```

### Adding a New Interface

1. **Define interface**:
   ```typescript
   // src/models/interfaces/newtype.ts
   export interface NewType {
     id: string;
     value: any;
   }
   ```

2. **Create type guards**:
   ```typescript
   // src/utils/newtype.ts
   export function isNewType(obj: any): obj is NewType {
     return (
       typeof obj === 'object' &&
       typeof obj.id === 'string' &&
       obj.value !== undefined
     );
   }

   export function guardAgainstInvalidNewType(obj: any): void {
     if (!isNewType(obj)) {
       throw new TypeError('Invalid NewType object');
     }
   }
   ```

3. **Export from index**:
   ```typescript
   // src/index.ts
   export { NewType } from './models/interfaces/newtype';
   export { isNewType, guardAgainstInvalidNewType } from './utils/newtype';
   ```

4. **Add tests**:
   ```typescript
   // src/utils/newtype.test.ts
   describe('isNewType', () => {
     test('validates correct NewType', () => {
       expect(isNewType({ id: '123', value: 'test' })).toBe(true);
     });
   });
   ```

### Extending the Library (User-facing)

Users can extend the library using `Domo.extend()`:

```typescript
import Domo, { get as originalGet } from 'ryuu.js';

Domo.extend({
  get: async (url, options) => {
    console.log(`Fetching: ${url}`);
    const result = await originalGet.call(Domo, url, options);
    console.log(`Received ${result.length} records`);
    return result;
  }
});
```

**Implementation:**

```typescript
// src/domo.ts
static extend(overrides: Partial<typeof Domo>): void {
  Object.assign(this, overrides);
}
```

This allows users to add custom logging, retry logic, caching, etc. without forking the library.

### Debugging Tips

1. **Check requests map**: `console.log(Domo.getRequests())` - See all tracked requests with status
2. **Monitor messages**: Add logging to `port1.onmessage` - Debug incoming messages
3. **Verify token**: `console.log(window.__RYUU_SID__)` - Check if auth token is present
4. **Check connection**: `console.log(Domo.connected)` - Verify MessageChannel initialized
5. **Inspect environment**: `console.log(Domo.env)` - View query parameters
6. **Test origin verification**: `console.log(Domo.__util.isVerifiedOrigin(window.location.origin))` - Security check
7. **Check mobile detection**: `console.log(isIOS(), isMobile())` - Verify platform detection
8. **Inspect specific request**: `console.log(Domo.getRequest(requestId))` - Debug single request

---

## Summary

This comprehensive guide covers the complete architecture and implementation of ryuu.js/domo.js. Key takeaways:

1. **Static Class Design**: All APIs exposed through static Domo class
2. **MessageChannel Communication**: Reliable bidirectional communication with parent
3. **Mobile Platform Support**: Cross-platform iOS/Android integration
4. **Type Safety**: Full TypeScript support with overloaded functions
5. **Event System**: Observer pattern for real-time updates
6. **Request Tracking**: Built-in acknowledgment system for reliability
7. **Extensibility**: Users can override methods via `extend()`
8. **Zero Dependencies**: Minimal bundle size, no runtime dependencies

When working with this codebase:
- Follow established naming conventions
- Add tests for all new functionality
- Use type guards for runtime validation
- Maintain backward compatibility for deprecated methods
- Document public APIs thoroughly
- Keep services bound to Domo class context

For questions or contributions, refer to the [README.md](README.md) for user-facing documentation and examples.
