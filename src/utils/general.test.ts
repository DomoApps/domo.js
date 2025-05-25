import { DataFormats } from '../models/enums/data-formats';
import { isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders } from './general';

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
});
