# Domo.js Demo App

This folder contains a comprehensive testing suite for the `domo.js` library, designed to test every aspect of the API in a real Domo app environment.

## Project Structure

```
demo/
├── index.html                 # Main demo page (refactored version)
├── manifest.json              # Domo app configuration
├── thumbnail.png              # App thumbnail
├── domo.js                    # Built library file
├── README.md                  # This documentation
└── assets/                    # Organized assets
    ├── css/
    │   └── styles.css         # All CSS styles, organized by component
    └── js/
        ├── tests.js           # Test definitions and configuration
        ├── utils.js           # Utility functions and helpers
        └── app.js             # Main application logic
```

## Refactoring Improvements

### 🏗️ **Separation of Concerns**
- **HTML**: Clean semantic structure without inline styles or scripts
- **CSS**: Organized by components with clear sections and responsive design
- **JavaScript**: Modular architecture with separate concerns

### 📁 **Modular Architecture**
- **`tests-standalone.js`**: All test definitions, configurations, and metadata
- **`utils-standalone.js`**: DOM utilities, statistics, formatting, and export functions
- **`app-standalone.js`**: Main application logic and orchestration
- **`styles.css`**: Comprehensive CSS organized by component type

### 🎯 **Code Quality Improvements**
- **Type Safety**: Better error handling and validation
- **Maintainability**: Clear function separation and documentation
- **Extensibility**: Easy to add new tests or modify existing ones
- **Performance**: Optimized DOM operations and event handling

### 🎨 **Enhanced User Experience**
- **Clean Interface**: Modern design with improved visual hierarchy
- **Responsive Layout**: Works seamlessly on desktop and mobile devices
- **Better Status Indicators**: Clear visual feedback for test states
- **Organized Actions**: Intuitive button placement and functionality

## Key Features

### 🧪 **Comprehensive Test Coverage**
- **HTTP Methods**: GET, POST, PUT, DELETE, getAll
- **Event Listeners**: onDataUpdated, onFiltersUpdated, onVariablesUpdated, onAppDataUpdated
- **Utility Functions**: Navigation, extend functionality, utility helpers
- **Performance Monitoring**: Timing information for all API calls
- **Error Handling**: Detailed error reporting with proper formatting

### 📊 **Advanced Testing Features**
- **Individual Test Controls**: Run and clear individual tests
- **Export Functionality**: Export test results as JSON with metadata
- **Real-time Statistics**: Live counters for passed/failed/pending tests
- **Enhanced Logging**: Detailed console output and visual feedback
- **Event-Driven Testing**: Automatic detection and handling of event-based APIs

### 🔧 **Developer Experience**
- **Modular Codebase**: Easy to extend and maintain
- **Clear Documentation**: Well-documented functions and classes
- **Error Boundaries**: Robust error handling throughout the application
- **Performance Monitoring**: Built-in timing and performance metrics

## How to Use

### Basic Testing
1. Open `index.html` in a browser within a Domo app context
2. Click "🚀 Run All Tests" to execute all automated tests
3. Review results in the interface

### Individual Test Management
1. **Run Specific Tests**: Use the "▶️ Run" buttons for individual tests
2. **Clear Results**: Use "🧹 Clear" buttons to reset individual test states
3. **View Details**: Check the "Details & Results" column for comprehensive output
4. **Monitor Performance**: Review timing information for each API call

### Event-Based Testing
Some tests require manual interaction:
- **onDataUpdated**: Change the linked dataset
- **onFiltersUpdated**: Modify page filters
- **onVariablesUpdated**: Change dashboard variables  
- **onAppDataUpdated**: Use the "📤 Send App Data" button

### Export and Analysis
1. **Export Results**: Click "📊 Export Results" to download comprehensive test data
2. **Review Statistics**: Monitor real-time pass/fail counters
3. **Debug Issues**: Check browser console for detailed logging

## Development

### File Organization

#### **CSS Architecture** (`assets/css/styles.css`)
- **Base Styles**: Typography, layout fundamentals
- **Layout Components**: Container, header, controls, content sections
- **Button Components**: Primary, secondary, small variants with hover states
- **Statistics Display**: Real-time counters and status indicators
- **Table Components**: Responsive table design with hover effects
- **Test Result Components**: Status badges, timing displays, error formatting
- **Loading Spinner**: Animated loading indicators
- **Responsive Design**: Mobile-first responsive breakpoints

#### **JavaScript Architecture**

**`tests.js`** - Test Configuration
- Test definitions with categories and descriptions
- HTTP endpoint configurations and test data
- Event listener setup and callback definitions
- Helper functions for test management and data reset

**`utils.js`** - Utility Classes
- **DOMUtils**: DOM manipulation and element creation
- **StatisticsManager**: Real-time statistics tracking and updates
- **ResultFormatter**: Test result formatting and display
- **ExportUtils**: JSON export functionality with metadata
- **GeneralUtils**: Common utilities like debouncing and logging

**`app.js`** - Main Application  
- **DomoTestApp**: Main application class with lifecycle management
- **Test Execution**: Sequential test running with error handling
- **Event Management**: Domo.js event listener registration and callbacks
- **UI Coordination**: Button states, loading indicators, and user interactions

### Adding New Tests

1. **Define the Test** in `tests.js`:
```javascript
{
  name: "new-api-test",
  category: "http", // or "events", "utilities"
  description: "Description of what this test does",
  fn: async () => {
    // Test implementation
    const result = await domo.newApiMethod();
    return { data: result, timing: "..." };
  },
}
```

2. **Categories**: Tests are automatically organized by category
3. **Event Tests**: Use `fn: () => new Promise()` for event-driven tests
4. **Custom Buttons**: Add `customButton: true` for special UI requirements

### Building and Deployment
```bash
# Build the domo.js library (from project root)
npm run build

# This copies dist/domo.js to demo/domo.js automatically
```

### Code Quality and Standards

#### **Error Handling**
- Comprehensive try-catch blocks around async operations
- Detailed error logging with context information
- User-friendly error messages in the UI
- Graceful degradation for missing APIs

#### **Performance Considerations**
- Debounced UI updates to prevent excessive re-renders
- Efficient DOM manipulation using utility classes
- Lazy initialization of expensive operations
- Memory leak prevention with proper event cleanup

#### **Accessibility**
- Semantic HTML structure with proper headings
- Keyboard navigation support
- Screen reader compatible status indicators
- High contrast color schemes

## API Coverage

The demo comprehensively tests the following domo.js APIs:

### **HTTP Methods**
- `domo.get()` - Retrieve data from endpoints
- `domo.post()` - Create new records with validation
- `domo.put()` - Update existing records
- `domo.delete()` - Remove records with confirmation
- All methods include timing and error handling

### **Event System**
- `domo.onDataUpdated()` - Dataset change events with callback registration
- `domo.onFiltersUpdated()` - Filter change events with real-time updates
- `domo.onVariablesUpdated()` - Variable change events with payload validation
- `domo.onAppDataUpdated()` - App data events with custom data handling
- `domo.requestFiltersUpdate()` - Proactive filter update requests
- `domo.requestVariablesUpdate()` - Variable update with structured payloads
- `domo.requestAppDataUpdate()` - App data transmission with validation

### **Configuration and Setup**
The demo uses the following configuration from `manifest.json`:
- **Collection**: `SanityTest` for HTTP method testing
- **Dataset**: Linked dataset for data update events
- **Variables**: Dashboard variables for variable testing
- **Embedding**: Required for full event testing capability

## Troubleshooting

### **Common Issues**

#### **domo.js Not Loaded**
```
Error: domo.js is not loaded
```
**Solution**: Ensure the library file exists and is accessible. Check the build process.

#### **Event Tests Not Triggering**
**Symptoms**: Event-driven tests remain in "Pending" state
**Solution**: Verify the app is embedded in a dashboard with appropriate data sources and user permissions.

#### **HTTP Tests Failing**
**Symptoms**: 403, 404, or network errors in HTTP tests
**Solution**: Check collection permissions, data source configuration, and network connectivity.

#### **Performance Issues**
**Symptoms**: Slow test execution or UI freezing
**Solution**: Check browser console for errors, ensure adequate system resources, and verify network stability.

### **Browser Compatibility**
- **Modern Browsers**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **ES6 Support**: Required for async/await and modern JavaScript features
- **Mobile Browsers**: iOS Safari 13+, Android Chrome 80+
- **Development Tools**: Chrome DevTools recommended for debugging

### **Debug Mode**
Enable detailed logging by opening browser console:
- Application initialization logs
- Test execution timing and results
- Event registration and callback execution
- Error stack traces with context

## Legacy Support

### **Original Demo**
The original single-file demo has been completely replaced by the refactored version. The benefits include:
- **Cleaner Code**: Separated concerns with modular architecture
- **Better Maintenance**: Individual files can be updated independently  
- **Enhanced Performance**: Optimized loading and execution
- **Professional Structure**: Modern web development best practices

### **File Structure Benefits**
The simplified three-file JavaScript structure provides:
- **`tests.js`**: Easy to add or modify test cases
- **`utils.js`**: Reusable utility functions across the application
- **`app.js`**: Main orchestration logic with clear entry points

### **Compatibility**
The refactored version provides the same testing functionality as the original with improved maintainability and performance. All API coverage and test results remain identical.
