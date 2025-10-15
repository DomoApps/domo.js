import { DataFormats } from '../models/enums/data-formats';
import { isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders, isIOS } from './general';

describe('general utilities', () => {
  describe('isSuccess', () => {
    it('returns true for 2xx status codes', () => {
      expect(isSuccess(200)).toBe(true);
      expect(isSuccess(250)).toBe(true);
      expect(isSuccess(299)).toBe(true);
    });
    it('returns false for non-2xx status codes', () => {
      expect(isSuccess(199)).toBe(false);
      expect(isSuccess(300)).toBe(false);
      expect(isSuccess(404)).toBe(false);
      expect(isSuccess(undefined as any)).toBe(false);
      expect(isSuccess(null as any)).toBe(false);
    });
  });

  describe('isVerifiedOrigin', () => {
    it('returns true for valid domo domains with https', () => {
      expect(isVerifiedOrigin('https://www.domo.com')).toBe(true);
      expect(isVerifiedOrigin('https://foo.domotech.io')).toBe(true);
      expect(isVerifiedOrigin('https://bar.domorig.com')).toBe(true);
    });
    it('returns false for http or non-whitelisted domains', () => {
      expect(isVerifiedOrigin('http://www.domo.com')).toBe(false);
      expect(isVerifiedOrigin('https://evil.com')).toBe(false);
      expect(isVerifiedOrigin('https://www.domoapps.com')).toBe(false);
      expect(isVerifiedOrigin('not a url')).toBe(false);
    });
    it('returns false for blacklisted domains', () => {
      expect(isVerifiedOrigin('https://www.domoapps.domo.com')).toBe(false);
    });
  });

  describe('getQueryParams', () => {
    const originalLocation = global.location;
    beforeAll(() => {
      Object.defineProperty(global, 'location', {
        value: { search: '?foo=bar&baz=qux' },
        configurable: true
      });
    });
    afterAll(() => {
      Object.defineProperty(global, 'location', { value: originalLocation, configurable: true });
    });
    it('parses query string into object', () => {
      const params = getQueryParams();
      expect(params.foo).toBe('bar');
      expect(params.baz).toBe('qux');
    });
  });

  describe('setFormatHeaders', () => {
    it('sets Accept header for data/v URLs and format', () => {
      const headers: Record<string, string> = {};
      setFormatHeaders(headers, 'https://domo.com/data/v1', { format: 'csv' } as any);
      expect(headers['Accept']).toBe(DataFormats.CSV);
    });
    it('does not set Accept header for non-data/v URLs', () => {
      const headers: Record<string, string> = {};
      setFormatHeaders(headers, 'https://domo.com/api/v1', { format: 'csv' } as any);
      expect(headers['Accept']).toBeUndefined();
    });
    it('defaults to ARRAY_OF_OBJECTS if format is not provided', () => {
      const headers: Record<string, string> = {};
      setFormatHeaders(headers, 'https://domo.com/data/v1', {});
      expect(headers['Accept']).toBe(DataFormats.ARRAY_OF_OBJECTS);
    });
    it('does not throw if headers is undefined', () => {
      expect(() => setFormatHeaders(undefined as any, 'https://domo.com/data/v1')).not.toThrow();
    });
    it('does not throw if url is undefined', () => {
      const headers: Record<string, string> = {};
      expect(() => setFormatHeaders(headers, undefined as any)).not.toThrow();
    });
    it('does not throw if options is undefined', () => {
      const headers: Record<string, string> = {};
      expect(() => setFormatHeaders(headers, 'https://domo.com/data/v1', undefined)).not.toThrow();
    });
  });

  describe('isIOS', () => {
    // Store original values
    let originalNavigator: any;
    let originalScreen: any;
    let originalWebkit: any;
    let originalDevicePixelRatio: any;
    let originalOntouchend: any;

    beforeAll(() => {
      // Store original values once
      originalNavigator = globalThis.navigator;
      originalScreen = globalThis.screen;
      originalWebkit = (globalThis as any).webkit;
      originalDevicePixelRatio = globalThis.devicePixelRatio;
      originalOntouchend = document.ontouchend;
    });

    beforeEach(() => {
      // Reset to clean state before each test
      delete (globalThis as any).navigator;
      delete (globalThis as any).screen;
      delete (globalThis as any).webkit;
      delete (globalThis as any).devicePixelRatio;
      delete (document as any).ontouchend;
    });

    afterEach(() => {
      // Clean up after each test
      delete (globalThis as any).navigator;
      delete (globalThis as any).screen;
      delete (globalThis as any).webkit;
      delete (globalThis as any).devicePixelRatio;
      delete (document as any).ontouchend;
    });

    afterAll(() => {
      // Restore original values after all tests
      if (originalNavigator !== undefined) {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNavigator,
          configurable: true,
          writable: true
        });
      }
      if (originalScreen !== undefined) {
        Object.defineProperty(globalThis, 'screen', {
          value: originalScreen,
          configurable: true,
          writable: true
        });
      }
      if (originalWebkit !== undefined) {
        Object.defineProperty(globalThis, 'webkit', {
          value: originalWebkit,
          configurable: true,
          writable: true
        });
      }
      if (originalDevicePixelRatio !== undefined) {
        Object.defineProperty(globalThis, 'devicePixelRatio', {
          value: originalDevicePixelRatio,
          configurable: true,
          writable: true
        });
      }
      if (originalOntouchend !== undefined) {
        Object.defineProperty(document, 'ontouchend', {
          value: originalOntouchend,
          configurable: true,
          writable: true
        });
      }
    });

    const mockEnvironment = (config: {
      navigator?: any;
      screen?: any;
      webkit?: any;
      devicePixelRatio?: number;
      ontouchend?: any;
    }) => {
      if (config.navigator) {
        Object.defineProperty(globalThis, 'navigator', {
          value: config.navigator,
          configurable: true,
          writable: true
        });
      }
      if (config.screen) {
        Object.defineProperty(globalThis, 'screen', {
          value: config.screen,
          configurable: true,
          writable: true
        });
      }
      if (config.webkit !== undefined) {
        Object.defineProperty(globalThis, 'webkit', {
          value: config.webkit,
          configurable: true,
          writable: true
        });
      }
      if (config.devicePixelRatio !== undefined) {
        Object.defineProperty(globalThis, 'devicePixelRatio', {
          value: config.devicePixelRatio,
          configurable: true,
          writable: true
        });
      }
      if (config.ontouchend !== undefined) {
        Object.defineProperty(document, 'ontouchend', {
          value: config.ontouchend,
          configurable: true,
          writable: true
        });
      }
      
      // Ensure window is defined
      if (!globalThis.window) {
        Object.defineProperty(globalThis, 'window', {
          value: globalThis,
          configurable: true,
          writable: true
        });
      }
    };

    it('returns false when window or navigator is undefined', () => {
      mockEnvironment({
        navigator: undefined
      });
      expect(isIOS()).toBe(false);
      
      mockEnvironment({
        navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)' }
      });
      Object.defineProperty(globalThis, 'window', {
        value: undefined,
        configurable: true
      });
      expect(isIOS()).toBe(false);
    });

    it('detects iPhone user agents', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
          maxTouchPoints: 5
        }
      });
      expect(isIOS()).toBe(true);
    });

    it('detects iPad user agents', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
          maxTouchPoints: 5
        }
      });
      expect(isIOS()).toBe(true);
    });

    it('detects iPod user agents', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X)',
          maxTouchPoints: 5
        }
      });
      expect(isIOS()).toBe(true);
    });

    it('detects iPad in desktop mode (Safari requesting desktop site)', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
          maxTouchPoints: 5
        },
        ontouchend: () => {}
      });
      expect(isIOS()).toBe(true);
    });

    it('does not detect macOS Safari as iOS when no touch support', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
          maxTouchPoints: 0
        },
        ontouchend: undefined
      });
      expect(isIOS()).toBe(false);
    });

    it('detects iOS through webkit messageHandlers API', () => {
      mockEnvironment({
        navigator: { userAgent: 'Mozilla/5.0 (Unknown Device)', maxTouchPoints: 0 },
        screen: { width: 375, height: 667 }, // iPhone dimensions
        webkit: { messageHandlers: { someHandler: {} } },
        devicePixelRatio: 2 // High pixel ratio typical of iOS
      });
      expect(isIOS()).toBe(true);
    });

    it('detects iOS through standalone mode (PWA)', () => {
      mockEnvironment({
        navigator: { 
          userAgent: 'Mozilla/5.0 (Unknown Device)', 
          maxTouchPoints: 0,
          standalone: true 
        },
        screen: { width: 375, height: 667 }, // iPhone dimensions
        webkit: { messageHandlers: { someHandler: {} } },
        devicePixelRatio: 2
      });
      expect(isIOS()).toBe(true);
    });

    it('recognizes common iPhone screen dimensions', () => {
      const iPhoneDimensions = [
        { width: 375, height: 667 }, // iPhone 6/7/8
        { width: 414, height: 736 }, // iPhone 6/7/8 Plus
        { width: 375, height: 812 }, // iPhone X/XS/11 Pro
        { width: 414, height: 896 }, // iPhone XR/XS Max/11/11 Pro Max
        { width: 390, height: 844 }, // iPhone 12/12 Pro/13/13 Pro
        { width: 428, height: 926 }, // iPhone 12/13 Pro Max
        { width: 393, height: 852 }, // iPhone 14 Pro
        { width: 430, height: 932 }  // iPhone 14 Pro Max
      ];

      for (const dimensions of iPhoneDimensions) {
        mockEnvironment({
          navigator: { userAgent: 'Mozilla/5.0 (Unknown Device)', maxTouchPoints: 0 },
          screen: dimensions,
          webkit: { messageHandlers: { someHandler: {} } },
          devicePixelRatio: 2
        });
        expect(isIOS()).toBe(true);
      }
    });

    it('recognizes common iPad screen dimensions', () => {
      const iPadDimensions = [
        { width: 768, height: 1024 }, // iPad
        { width: 834, height: 1112 }, // iPad Pro 10.5"
        { width: 834, height: 1194 }, // iPad Pro 11"
        { width: 1024, height: 1366 } // iPad Pro 12.9"
      ];

      for (const dimensions of iPadDimensions) {
        mockEnvironment({
          navigator: { userAgent: 'Mozilla/5.0 (Unknown Device)', maxTouchPoints: 0 },
          screen: dimensions,
          webkit: { messageHandlers: { someHandler: {} } },
          devicePixelRatio: 2
        });
        expect(isIOS()).toBe(true);
      }
    });

    it('does not detect Android devices as iOS', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
          maxTouchPoints: 5
        }
      });
      expect(isIOS()).toBe(false);
    });

    it('does not detect Windows devices as iOS', () => {
      mockEnvironment({
        navigator: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          maxTouchPoints: 0
        }
      });
      expect(isIOS()).toBe(false);
    });

    it('requires multiple indicators for non-obvious cases', () => {
      // High pixel ratio alone should not be enough
      mockEnvironment({
        navigator: { userAgent: 'Mozilla/5.0 (Unknown Device)', maxTouchPoints: 0 },
        screen: { width: 1920, height: 1080 },
        webkit: undefined,
        devicePixelRatio: 3
      });
      expect(isIOS()).toBe(false);

      // Screen dimensions alone without webkit APIs should not be enough
      mockEnvironment({
        navigator: { userAgent: 'Mozilla/5.0 (Unknown Device)', maxTouchPoints: 0 },
        screen: { width: 375, height: 667 },
        webkit: undefined,
        devicePixelRatio: 1
      });
      expect(isIOS()).toBe(false);
    });
  });
});
