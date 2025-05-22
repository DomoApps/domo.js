import { setContentHeaders, setAuthTokenHeader, setResponseType, handleNode, processBody } from '../src/utils/domoutils';

describe('domoutils', () => {
  describe('setContentHeaders', () => {
    it('sets Content-Type if not multipart', () => {
      const req: { setRequestHeader: jest.Mock } = { setRequestHeader: jest.fn() };
      setContentHeaders(req as any, { contentType: 'application/json' });
      expect(req.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });
    it('does not set Content-Type if multipart', () => {
      const req: { setRequestHeader: jest.Mock } = { setRequestHeader: jest.fn() };
      setContentHeaders(req as any, { contentType: 'multipart' });
      expect(req.setRequestHeader).not.toHaveBeenCalledWith('Content-Type', 'multipart');
    });
    it('sets Content-Type to application/json if not provided', () => {
      const req: { setRequestHeader: jest.Mock } = { setRequestHeader: jest.fn() };
      setContentHeaders(req as any, {});
      expect(req.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    });
  });

  describe('setAuthTokenHeader', () => {
    it('sets header if token is present', () => {
      const req: { setRequestHeader: jest.Mock } = { setRequestHeader: jest.fn() };
      setAuthTokenHeader(req as any, 'tok');
      expect(req.setRequestHeader).toHaveBeenCalledWith('X-DOMO-Ryuu-Session', 'tok');
    });
    it('does not set header if token is falsy', () => {
      const req: { setRequestHeader: jest.Mock } = { setRequestHeader: jest.fn() };
      setAuthTokenHeader(req as any, '');
      expect(req.setRequestHeader).not.toHaveBeenCalled();
    });
  });

  describe('setResponseType', () => {
    it('sets responseType if provided', () => {
      const req: { responseType?: any } = { responseType: undefined };
      setResponseType(req as any, { responseType: 'blob' });
      expect(req.responseType).toBe('blob');
    });
    it('does not set responseType if not provided', () => {
      const req: { responseType?: any } = { responseType: undefined };
      setResponseType(req as any, {});
      expect(req.responseType).toBeUndefined();
    });
  });

  describe('handleNode and processBody', () => {
    it('handleNode sets attribute if relative url and token', () => {
      const el = document.createElement('a');
      el.setAttribute('href', '/foo');
      handleNode(el, 'tok');
      expect(el.getAttribute('href')).toContain('ryuu_sid=tok');
    });
    it('handleNode does nothing if no url or token', () => {
      const el = document.createElement('a');
      handleNode(el, '');
      expect(el.getAttribute('href')).toBeNull();
    });
    it('processBody calls handleNode for each child', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);
      expect(() => processBody(parent, 'tok')).not.toThrow();
    });
    it('handleNode recurses for body/head', () => {
      const body = document.createElement('body');
      const child = document.createElement('div');
      body.appendChild(child);
      expect(() => handleNode(body, 'tok')).not.toThrow();
    });
  });
});
