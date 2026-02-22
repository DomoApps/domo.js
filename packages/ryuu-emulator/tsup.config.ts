// Two configs run sequentially via the build script to avoid a DTS race:
//   tsup.browser.config.ts  — core.ts + auto.ts  (platform: browser)
//   tsup.vite.config.ts     — vite.ts             (platform: node)
//
// This file is kept as documentation only; the build script calls the
// split configs directly.
