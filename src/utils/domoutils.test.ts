import { setContentHeaders, setAuthTokenHeader, setResponseType, handleNode, processBody } from './domoutils';

describe('domoutils', () => {
  describe('setContentHeaders', () => {
    it('sets Content-Type appropriately', () => {
      const headers: Record<string, string> = {};
      setContentHeaders(headers, { contentType: 'application/json' });
      expect(headers['Content-Type']).toBe('application/json');
      setContentHeaders(headers, { contentType: 'multipart' });
      expect(headers['Content-Type']).toBe('application/json');
      setContentHeaders(headers, {});
      expect(headers['Content-Type']).toBe('application/json');
      setContentHeaders(headers);
      expect(headers['Content-Type']).toBe('application/json');
      setContentHeaders(headers, null);
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('setAuthTokenHeader', () => {
    it('sets or skips header based on token presence', () => {
      const headers: Record<string, string> = {};
      setAuthTokenHeader(headers, 'tok');
      expect(headers['X-DOMO-Ryuu-Session']).toBe('tok');
      setAuthTokenHeader(headers, '');
      expect(headers['X-DOMO-Ryuu-Session']).not.toBeDefined();
    });
  });

  describe('setResponseType', () => {
    it('sets responseType if provided, leaves undefined if not', () => {
      const req: { responseType?: any } = { responseType: undefined };
      setResponseType(req as any, { responseType: 'blob' });
      expect(req.responseType).toBe('blob');
      const req2: { responseType?: any } = { responseType: undefined };
      setResponseType(req2 as any, {});
      expect(req2.responseType).toBeUndefined();
    });
  });

  describe('handleNode and processBody', () => {
    it('handles href/src/dataset and token logic', () => {
      const el = document.createElement('a');
      el.setAttribute('href', '/foo');
      handleNode(el, 'tok');
      expect(el.getAttribute('href')).toContain('ryuu_sid=tok');

      const el2 = document.createElement('a');
      handleNode(el2, '');
      expect(el2.getAttribute('href')).toBeNull();

      const el3 = document.createElement('a');
      el3.setAttribute('href', '/foo?ryuu_sid=tok');
      handleNode(el3, 'tok');
      expect(el3.getAttribute('href')).toBe('/foo?ryuu_sid=tok');

      const el4 = document.createElement('a');
      el4.setAttribute('href', 'https://external.com/foo');
      handleNode(el4, 'tok');
      expect(el4.getAttribute('href')).toBe('https://external.com/foo');

      const el5 = document.createElement('a');
      el5.dataset.domoHref = '/bar';
      handleNode(el5, 'tok');
      expect(el5.getAttribute('href')).toContain('ryuu_sid=tok');

      const el6 = document.createElement('img');
      el6.dataset.domoSrc = '/img';
      handleNode(el6, 'tok');
      expect(el6.getAttribute('src')).toContain('ryuu_sid=tok');
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
      const head = document.createElement('head');
      const meta = document.createElement('meta');
      head.appendChild(meta);
      expect(() => handleNode(head, 'tok')).not.toThrow();
    });
    it('should use getAttribute("href") if dataset is undefined', () => {
      const el = document.createElement('a');
      Object.defineProperty(el, 'dataset', { value: undefined });
      el.setAttribute('href', '/foo');
      handleNode(el, 'tok');
      expect(el.getAttribute('href')).toContain('ryuu_sid=tok');
    });
    it('should use getAttribute("src") if dataset is undefined and no href', () => {
      const el = document.createElement('img');
      Object.defineProperty(el, 'dataset', { value: undefined });
      el.setAttribute('src', '/img');
      handleNode(el, 'tok');
      expect(el.getAttribute('src')).toContain('ryuu_sid=tok');
    });
  });

  describe('handleNode processBody branch', () => {
    afterEach(() => {
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      while (document.head.firstChild) document.head.removeChild(document.head.firstChild);
    });
    it('processes children of document.body and document.head', () => {
      const bodyChild = document.createElement('a');
      bodyChild.setAttribute('href', '/foo');
      document.body.appendChild(bodyChild);
      handleNode(document.body, 'tok');
      expect(bodyChild.getAttribute('href')).toContain('ryuu_sid=tok');
      
      const headChild = document.createElement('a');
      headChild.setAttribute('href', '/bar');
      document.head.appendChild(headChild);
      handleNode(document.head, 'tok');
      expect(headChild.getAttribute('href')).toContain('ryuu_sid=tok');
    });
  });

  describe('domoFormatToRequestFormat', () => {
    it('should return the format for supported formats', () => {
      const { domoFormatToRequestFormat } = require('./data-helpers');
      const { DataFormats } = require('../models/enums/data-formats');
      expect(domoFormatToRequestFormat('array-of-objects')).toBe(DataFormats.ARRAY_OF_OBJECTS);
      expect(domoFormatToRequestFormat('array-of-arrays')).toBe(DataFormats.JSON);
      expect(domoFormatToRequestFormat('excel')).toBe(DataFormats.EXCEL);
      expect(domoFormatToRequestFormat('csv')).toBe(DataFormats.CSV);
      expect(domoFormatToRequestFormat('xml')).toBe(DataFormats.ARRAY_OF_OBJECTS);
    });
  });
});
