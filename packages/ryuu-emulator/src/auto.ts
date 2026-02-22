import { DomoEmulator } from './core';

const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(
  window.location.hostname,
);
const isStandalone = window.parent === window;
const config = (window as typeof window & { __DOMO_MOCK__?: object }).__DOMO_MOCK__ ?? {};

if (isLocalhost && isStandalone) {
  new DomoEmulator(config).install();
}
