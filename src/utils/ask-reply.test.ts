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

    it('silently returns if request not found (host-initiated push)', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleAck.call(context, { requestId: 'notfound' }, {} as MessagePort);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('silently skips if request already acknowledged', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleAck.call(context, { requestId: 'req2' }, {} as MessagePort);
      expect(warn).not.toHaveBeenCalled();
      // Status stays acknowledged, not overwritten
      expect(context.requests.req2.request.status).toBe('acknowledged');
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

    it('silently returns if request not found (host-initiated push)', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      handleReply.call(context, 'notfound', {});
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('fulfills a pending request directly (reply without prior ack)', () => {
      handleReply.call(context, 'req1', { direct: true });
      expect(context.requests.req1.request.status).toBe('fulfilled');
      expect(context.requests.req1.request.onReply).toHaveBeenCalledWith({ direct: true }, undefined);
    });

    it('warns and returns early if request already fulfilled', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      // First reply — succeeds
      handleReply.call(context, 'req2', { first: true });
      expect(context.requests.req2.request.status).toBe('fulfilled');
      // Second reply — warns and returns
      handleReply.call(context, 'req2', { second: true });
      expect(warn).toHaveBeenCalledWith(
        'Request req2 already finalized, current status: fulfilled'
      );
      // Response unchanged from first reply
      expect(context.requests.req2.response.payload).toEqual({ first: true });
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

    it('silently returns if request not found (ack)', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleAck({ requestId: 'notfound' }, {} as MessagePort);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('silently returns if request not found (reply)', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleReply('notfound', {});
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('silently skips ack if request not pending', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      Domo.handleAck({ requestId: 'req2' }, {} as MessagePort);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('fulfills a pending request directly via handleReply (no prior ack)', () => {
      Domo.handleReply('req1', { direct: true });
      const req = Domo.getRequest('req1').request;
      expect(req.status).toBe('fulfilled');
      expect(req.onReply).toHaveBeenCalledWith({ direct: true }, undefined);
    });
  });
});
