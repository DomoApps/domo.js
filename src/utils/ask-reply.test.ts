import { handleAck, handleReply } from './ask-reply';
import Domo from '../domo';

describe('ask-reply utils', () => {
  let context: any;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);
    context = {
      requests: {
        req1: {
          request: {
            status: 'pending',
            payload: { foo: 'bar' },
            onAck: jest.fn(),
            onReply: jest.fn(),
          },
        },
        req2: {
          request: {
            status: 'acknowledged',
            payload: { foo: 'baz' },
            onAck: jest.fn(),
            onReply: jest.fn(),
          },
        },
      },
    };
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  describe('handleAck', () => {
    it('acknowledges a pending request', () => {
      handleAck.call(context, { requestId: 'req1' }, {} as MessagePort);
      expect(context.requests.req1.request.status).toBe('acknowledged');
      expect(context.requests.req1.request.ackAt).toBe(1234567890);
      expect(context.requests.req1.request.onAck).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('logs warning if request not found', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleAck.call(context, { requestId: 'notfound' }, {} as MessagePort);
      expect(warn).toHaveBeenCalledWith('No request found for ID: notfound');
      warn.mockRestore();
    });

    it('logs warning if request not pending', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleAck.call(context, { requestId: 'req2' }, {} as MessagePort);
      expect(warn).toHaveBeenCalledWith(
        'Request req2 is not pending, current status: acknowledged'
      );
      warn.mockRestore();
    });
  });

  describe('handleReply', () => {
    it('fulfills an acknowledged request', () => {
      handleReply.call(context, 'req2', { bar: 'baz' });
      expect(context.requests.req2.request.status).toBe('fulfilled');
      expect(context.requests.req2.request.repliedAt).toBe(1234567890);
      expect(context.requests.req2.response).toEqual({
        payload: { bar: 'baz' },
        status: 'fulfilled',
        error: undefined,
        repliedAt: 1234567890,
      });
      expect(context.requests.req2.request.onReply).toHaveBeenCalledWith({ bar: 'baz' }, undefined);
    });

    it('rejects an acknowledged request with error', () => {
      const error = new Error('fail');
      handleReply.call(context, 'req2', null, error);
      expect(context.requests.req2.request.status).toBe('rejected');
      expect(context.requests.req2.response.status).toBe('rejected');
      expect(context.requests.req2.response.error).toBe(error);
      expect(context.requests.req2.request.onReply).toHaveBeenCalledWith(null, error);
    });

    it('logs warning if request not found', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleReply.call(context, 'notfound', {});
      expect(warn).toHaveBeenCalledWith('No request found for ID: notfound');
      warn.mockRestore();
    });

    it('logs warning if request not acknowledged', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleReply.call(context, 'req1', {});
      expect(warn).toHaveBeenCalledWith(
        'Request req1 is not acknowledged, current status: pending'
      );
      warn.mockRestore();
    });
  });

  describe('Domo.handleAck and handleReply integration', () => {
    let nowSpy: jest.SpyInstance<number, []>;
    let origRequests: any;

    beforeEach(() => {
      nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);
      origRequests = { ...Domo.getRequests() };
      Domo['requests'] = {
        req1: {
          request: {
            status: 'pending',
            payload: { foo: 'bar' },
            onAck: jest.fn(),
            onReply: jest.fn(),
          },
        },
        req2: {
          request: {
            status: 'acknowledged',
            payload: { foo: 'baz' },
            onAck: jest.fn(),
            onReply: jest.fn(),
          },
        },
      };
    });

    afterEach(() => {
      nowSpy.mockRestore();
      Domo['requests'] = origRequests;
    });

    it('acknowledges a pending request', () => {
      Domo.handleAck({ requestId: 'req1' }, {} as MessagePort);
      const req = Domo.getRequest('req1').request;
      expect(req.status).toBe('acknowledged');
      expect(req.ackAt).toBe(1234567890);
      expect(req.onAck).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('fulfills an acknowledged request', () => {
      Domo.handleReply('req2', { bar: 'baz' });
      const req = Domo.getRequest('req2').request;
      expect(req.status).toBe('fulfilled');
      expect(req.repliedAt).toBe(1234567890);
      expect(Domo.getRequest('req2').response).toEqual({
        payload: { bar: 'baz' },
        status: 'fulfilled',
        error: undefined,
        repliedAt: 1234567890,
      });
      expect(req.onReply).toHaveBeenCalledWith({ bar: 'baz' }, undefined);
    });

    it('rejects an acknowledged request with error', () => {
      const error = new Error('fail');
      Domo.handleReply('req2', null, error);
      const req = Domo.getRequest('req2').request;
      expect(req.status).toBe('rejected');
      expect(Domo.getRequest('req2').response?.status).toBe('rejected');
      expect(Domo.getRequest('req2').response?.error).toBe(error);
      expect(req.onReply).toHaveBeenCalledWith(null, error);
    });

    it('logs warning if request not found (ack)', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleAck({ requestId: 'notfound' }, {} as MessagePort);
      expect(warn).toHaveBeenCalledWith('No request found for ID: notfound');
      warn.mockRestore();
    });

    it('logs warning if request not found (reply)', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleReply('notfound', {});
      expect(warn).toHaveBeenCalledWith('No request found for ID: notfound');
      warn.mockRestore();
    });

    it('logs warning if request not pending', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleAck({ requestId: 'req2' }, {} as MessagePort);
      expect(warn).toHaveBeenCalledWith(
        'Request req2 is not pending, current status: acknowledged'
      );
      warn.mockRestore();
    });

    it('logs warning if request not acknowledged', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleReply('req1', {});
      expect(warn).toHaveBeenCalledWith(
        'Request req1 is not acknowledged, current status: pending'
      );
      warn.mockRestore();
    });
  });
});
