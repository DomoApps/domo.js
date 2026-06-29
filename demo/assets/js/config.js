/**
 * Application configuration — manifest aliases, endpoint presets, UI constants.
 * All manifest values are hardcoded to match manifest.json.
 */

const APP_CONFIG = {
  // Manifest-declared aliases (must match manifest.json)
  DATASET_ALIAS: 'test',
  COLLECTION: 'SanityTest',
  WORKFLOW_ALIAS: 'testWorkflow',
  PACKAGE_ALIAS: 'awesomeFunction',
  BROADCAST_TOPIC: 'testChannel',

  // Endpoint presets for Request Builder autocomplete
  ENDPOINT_PRESETS: [
    { label: 'AppDB — List documents',       method: 'GET',    url: '/domo/datastores/v1/collections/SanityTest/documents/' },
    { label: 'AppDB — Create document',      method: 'POST',   url: '/domo/datastores/v1/collections/SanityTest/documents/', body: '{ "content": { "foo": "bar" } }' },
    { label: 'Data API — Query',             method: 'GET',    url: '/data/v1/test?limit=10' },
    { label: 'Data API — SQL',               method: 'POST',   url: '/sql/v1/test', body: 'SELECT * FROM test LIMIT 5', contentType: 'text/plain' },
    { label: 'Environment',                  method: 'GET',    url: '/domo/environment/v1' },
    { label: 'Users',                        method: 'GET',    url: '/domo/users/v1?limit=5' },
    { label: 'Code Engine',                  method: 'POST',   url: '/domo/codeengine/v2/packages/awesomeFunction', body: '{ "number1AppInput": 5, "number2AppInput": 10 }' },
    { label: 'Workflow — Start',             method: 'POST',   url: '/domo/workflow/v1/models/testWorkflow/start', body: '{}' },
    { label: 'AI — Generate Text',           method: 'POST',   url: '/domo/ai/v1/text/generation', body: '{ "input": "Tell me a joke about data." }' },
    { label: 'Error test (404)',             method: 'GET',    url: '/domo/this-endpoint-does-not-exist-404' },
    { label: 'AppDB — Update document',     method: 'PUT',    url: '/domo/datastores/v1/collections/SanityTest/documents/{docId}', body: '{ "content": { "foo": "updated" } }' },
    { label: 'AppDB — Delete document',     method: 'DELETE',  url: '/domo/datastores/v1/collections/SanityTest/documents/{docId}' },
  ],

  // Format options for request builder
  FORMAT_OPTIONS: [
    { value: '',                 label: 'Default (JSON)' },
    { value: 'array-of-objects', label: 'Array of Objects' },
    { value: 'array-of-arrays',  label: 'Array of Arrays' },
    { value: 'csv',              label: 'CSV' },
    { value: 'excel',            label: 'Excel' },
  ],

  // Event types for monitor filtering
  EVENT_TYPES: ['dataUpdated', 'filtersUpdated', 'variablesUpdated', 'appData', 'ack', 'subscribe', 'filter', 'variable', 'navigate', 'ROUTE_CHANGE', 'http'],

  // Tab definitions
  TABS: [
    { id: 'tests',   label: 'Test Suite',       icon: '#' },
    { id: 'request', label: 'Request Builder', icon: '/' },
    { id: 'monitor', label: 'Event Monitor',   icon: '~' },
  ],
};

// Category metadata for test suite cards
const CATEGORY_META = {
  data:       { icon: 'Q', label: 'Data API',         cssClass: 'data' },
  appdb:      { icon: 'D', label: 'AppDB',            cssClass: 'appdb' },
  events:     { icon: '~', label: 'Events',           cssClass: 'events' },
  codeengine: { icon: '>', label: 'Code Engine',      cssClass: 'codeengine' },
  workflow:   { icon: '%', label: 'Workflows',        cssClass: 'workflow' },
  ai:         { icon: '*', label: 'AI Services',      cssClass: 'ai' },
  utils:      { icon: '#', label: 'Utilities',        cssClass: 'utils' },
  params:     { icon: '?', label: 'URL Params',       cssClass: 'params' },
  dx:         { icon: '+', label: 'DX Tools',         cssClass: 'dx' },
  echo:       { icon: '@', label: 'Host Echo',        cssClass: 'events' },
  routing:    { icon: '^', label: 'Route Capture',   cssClass: 'events' },
  broadcast:  { icon: 'B', label: 'Broadcast',       cssClass: 'broadcast' },
};

// Test status labels
const STATUS_LABELS = {
  success: 'Passed',
  fail: 'Failed',
  pending: 'Pending',
  running: 'Running',
  skipped: 'N/A',
};
