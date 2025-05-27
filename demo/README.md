# Domo.js Demo App

This folder contains a sample Domo app designed to test every aspect of the `domo.js` library.

## Purpose

The files in this folder (especially `index.html`) provide a simple UI and automated feature tests to verify that all major features and API methods of `domo.js` work as expected in a real Domo app environment.

## How it works

- **index.html**: Loads the built `domo.js` library and provides a button to run a suite of feature tests. Each test exercises a different part of the API (HTTP methods, filter handling, variable events, etc.) and reports the result in a table.
- **manifest.json**: Metadata for the Domo app, including its name, description, and configuration for Domo's app platform.
- **thumbnail.png**: A visual thumbnail for the app in the Domo UI.

## Usage

1. Open `index.html` in a browser (preferably within a Domo app context).
2. Click "Run All Feature Tests" to execute the tests.
3. Review the results in the table to verify that all features are working as intended.

## Notes

- This demo is intended for development and validation of the `domo.js` library.
- You can add or modify tests in `index.html` to cover new features or edge cases as needed.
