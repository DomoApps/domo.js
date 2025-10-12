# Domo.js Demo App

This folder contains a comprehensive testing suite for the `domo.js` library, designed to test every aspect of the API in a real Domo app environment.

## Files

- **index.html**: Original demo app with basic testing functionality
- **index-improved.html**: Enhanced demo app with modern UI and comprehensive testing
- **manifest.json**: Metadata for the Domo app configuration
- **thumbnail.png**: Visual thumbnail for the app in the Domo UI
- **domo.js**: Built library file (generated from `npm run build`)

## Enhanced Demo Features

The improved demo app (`index-improved.html`) includes:

### 🎨 Modern User Interface
- Responsive design with card and table view options
- Modern gradients, shadows, and animations
- Mobile-friendly responsive layout
- Progress bar showing test completion
- Category-based test filtering (HTTP, Events, Utilities)

### 🧪 Comprehensive Test Coverage
- **HTTP Methods**: GET, POST, PUT, DELETE, getAll
- **Event Listeners**: onDataUpdated, onFiltersUpdated, onVariablesUpdated, onAppDataUpdated
- **Utility Functions**: Navigation, extend functionality, utility helpers
- **Performance Monitoring**: Timing information for all API calls
- **Error Handling**: Detailed error reporting with stack traces

### 📊 Advanced Features
- **Individual Test Controls**: Run and clear individual tests
- **Export Functionality**: Export test results as JSON
- **Real-time Statistics**: Live counters for passed/failed/pending tests
- **Enhanced Logging**: Detailed console output and visual feedback
- **Category Filtering**: Filter tests by type (All, HTTP, Events, Utilities)

## How to Use

### Basic Testing
1. Open either `index.html` or `index-improved.html` in a browser within a Domo app context
2. Click "🚀 Run All Tests" to execute all automated tests
3. Review results in the interface

### Advanced Testing (Enhanced Demo)
1. **View Options**: Toggle between card view and table view
2. **Category Filtering**: Use tabs to filter tests by category
3. **Individual Tests**: Run specific tests using the "▶️ Run" buttons
4. **Export Results**: Download comprehensive test results as JSON
5. **Error Analysis**: View detailed error information for failed tests

### Event-Based Testing
Some tests require manual interaction:
- **onDataUpdated**: Change the linked dataset
- **onFiltersUpdated**: Modify page filters
- **onVariablesUpdated**: Change dashboard variables
- **onAppDataUpdated**: Use the "Send App Data" button

## API Coverage

The demo tests the following domo.js APIs:

### HTTP Methods
- `domo.get()` - Retrieve data
- `domo.post()` - Create new records
- `domo.put()` - Update existing records  
- `domo.delete()` - Remove records
- `domo.getAll()` - Batch requests

### Event System
- `domo.onDataUpdated()` - Dataset change events
- `domo.onFiltersUpdated()` - Filter change events
- `domo.onVariablesUpdated()` - Variable change events
- `domo.onAppDataUpdated()` - App data events
- `domo.requestFiltersUpdate()` - Request filter updates
- `domo.requestVariablesUpdate()` - Send variable updates
- `domo.requestAppDataUpdate()` - Send app data

### Utilities
- `domo.navigate()` - Page navigation
- `domo.extend()` - Extend functionality
- `domo.__util.*` - Utility functions (getQueryParams, isSuccess, etc.)

## Development

### Building the Demo
```bash
# Build the domo.js library
npm run build

# This copies dist/domo.js to demo/domo.js automatically
```

### Testing New Features
1. Add new test cases to the `features` array in the HTML file
2. Include appropriate category, description, and test function
3. Test both success and failure scenarios
4. Document any special requirements or dependencies

### Configuration
The demo uses the following configuration from `manifest.json`:
- **Collection**: `SanityTest` for HTTP method testing
- **Dataset**: Linked dataset for data update events
- **Variables**: Dashboard variables for variable testing

## Notes

- The demo is intended for development and validation of the `domo.js` library
- Some tests depend on others (e.g., PUT/DELETE require POST to create a record)
- Event-based tests require the app to be embedded in a Domo dashboard
- The enhanced demo provides better debugging and analysis capabilities
- Performance timing helps identify potential bottlenecks in API calls

## Troubleshooting

### Common Issues
1. **domo.js not loaded**: Ensure the library file exists and is accessible
2. **Event tests not triggering**: Verify the app is embedded in a dashboard with appropriate data sources
3. **HTTP tests failing**: Check collection permissions and data source configuration
4. **Navigation tests**: These are mocked to prevent actual navigation during testing

### Browser Compatibility
- Modern browsers with ES6+ support
- Mobile browsers for responsive testing
- Development tools for debugging and console output
