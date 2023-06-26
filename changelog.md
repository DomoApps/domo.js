# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [4.4.0](https://github.com/DomoApps/domo.js/compare/v2.5.8...v4.4.0) (2023-06-26)


### Features

* **onDataUpdate:** verify origin of data recieved ([#10](https://github.com/DomoApps/domo.js/issues/10)) ([d5b8594](https://github.com/DomoApps/domo.js/commit/d5b8594f8baf8a220db1b3aaab449e819b081757))
* **onFiltersUpdate:** DOMO-275255 ([868be22](https://github.com/DomoApps/domo.js/commit/868be22147b4cb64b191986e07bc6cb318da05d1))


### Bug Fixes

* add checking to onDataUpdate event listener ([#9](https://github.com/DomoApps/domo.js/issues/9)) ([d4e07cd](https://github.com/DomoApps/domo.js/commit/d4e07cd4a801ee68f3df115f6adaee9fba98eca9))
* changed to only append SID if it doesn't exist ([95fdbe2](https://github.com/DomoApps/domo.js/commit/95fdbe2fb36a76e8c2428a2cfcbe24beb422fda5))
* **onFiltersUpdate:** call each callback on event ([0aba05f](https://github.com/DomoApps/domo.js/commit/0aba05f0f0de23d2cccdf6be928a294bbc0c57c5))

# v3.0.0
Converted to TypeScript

# v2.0.0
Parse the JSON response

# v1.0.0
Initial release.
Polyfill the Promise API for older browsers
`domo.get` - fetch a single data source
`domo.getAll` - fetch many data sources
`domo.env` - get environment variables
