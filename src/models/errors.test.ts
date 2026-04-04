import { DomoHttpError, DomoAuthError, DomoTimeoutError, DomoValidationError, DomoConnectionError } from './errors';

describe('Structured Error Types', () => {
  describe('DomoHttpError', () => {
    it('sets all properties correctly', () => {
      const error = new DomoHttpError('HTTP error 500: Internal Server Error', 500, 'Internal Server Error', '{"msg":"fail"}', { 'content-type': 'application/json' });
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomoHttpError);
      expect(error.name).toBe('DomoHttpError');
      expect(error.message).toBe('HTTP error 500: Internal Server Error');
      expect(error.status).toBe(500);
      expect(error.statusText).toBe('Internal Server Error');
      expect(error.body).toBe('{"msg":"fail"}');
      expect(error.headers).toEqual({ 'content-type': 'application/json' });
    });

    it('has a proper stack trace', () => {
      const error = new DomoHttpError('test', 500, 'Error', '', {});
      expect(error.stack).toBeDefined();
    });
  });

  describe('DomoAuthError', () => {
    it('extends DomoHttpError', () => {
      const error = new DomoAuthError('HTTP error 401: Unauthorized', 401, 'Unauthorized', '', {});
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomoHttpError);
      expect(error).toBeInstanceOf(DomoAuthError);
      expect(error.name).toBe('DomoAuthError');
      expect(error.status).toBe(401);
    });

    it('works for 403 responses', () => {
      const error = new DomoAuthError('HTTP error 403: Forbidden', 403, 'Forbidden', '', {});
      expect(error).toBeInstanceOf(DomoAuthError);
      expect(error.status).toBe(403);
    });
  });

  describe('DomoTimeoutError', () => {
    it('sets url property', () => {
      const error = new DomoTimeoutError('Request timed out', '/api/data');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DomoTimeoutError');
      expect(error.message).toBe('Request timed out');
      expect(error.url).toBe('/api/data');
    });
  });

  describe('DomoValidationError', () => {
    it('sets errors array', () => {
      const details = [{ field: 'column', issue: 'missing' }];
      const error = new DomoValidationError('Invalid filter', details);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DomoValidationError');
      expect(error.message).toBe('Invalid filter');
      expect(error.errors).toEqual(details);
    });

    it('defaults errors to empty array', () => {
      const error = new DomoValidationError('Bad input');
      expect(error.errors).toEqual([]);
    });
  });

  describe('DomoConnectionError', () => {
    it('sets name and message', () => {
      const error = new DomoConnectionError('Failed to fetch');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DomoConnectionError');
      expect(error.message).toBe('Failed to fetch');
    });
  });
});
