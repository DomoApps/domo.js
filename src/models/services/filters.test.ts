import Domo from '../../domo';
import { FilterOperatorsString } from '../interfaces/filter-operators';
import { FilterDataTypes } from '../interfaces/filter-data-types';

class MockMessagePort {
  onmessage: ((event: any) => void) | null = null;
  postMessage = jest.fn();
  close = jest.fn();
}
(global as any).MessagePort = MockMessagePort;
(global as any).MessageChannel = class {
  port1 = new MockMessagePort();
  port2 = new MockMessagePort();
};

function makeMessageEvent(data: any, ports: any[] = []) {
  return { data, ports } as any;
}

function makeMockPort() {
  return {
    postMessage: jest.fn(),
    onmessage: null as any,
    onmessageerror: null as any,
    close: jest.fn(),
    start: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
}

describe('Filters Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    window.parent.postMessage = jest.fn();
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true
    });
    (window as any).webkit = { messageHandlers: { domofilter: { postMessage: jest.fn() }, domovariable: { postMessage: jest.fn() } } };
  });

  describe('filterContainer', () => {
    it('should call filterContainer', () => {
      Domo.filterContainer([
        { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING }
      ], true);
      expect(window.parent.postMessage).toHaveBeenCalled();
    });

    it('should detect webkit and call messageHandlers', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      const filter = [{ column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: 'STRING' }];
      const postMessageMock = jest.fn();
      (window as any).webkit = { messageHandlers: { domofilter: { postMessage: postMessageMock }, domovariable: { postMessage: jest.fn() } } };
      Domo.filterContainer(filter as any, true);
      expect(postMessageMock).toHaveBeenCalled();
    });

    it('should support legacy operand property in filter', () => {
      const filter = [{ column: 'a', operand: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING }];
      Domo.filterContainer(filter as any, true);
      expect(window.parent.postMessage).toHaveBeenCalled();
    });

    it('should call webkit.messageHandlers.domofilter.postMessage for iOS in filterContainer', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      (window as any).webkit = { messageHandlers: { domofilter: { postMessage: jest.fn() } } };
      const filter = [{ column: 'a', operator: 'IN', values: ['x'], dataType: 'STRING' }];
      Domo.filterContainer(filter as any, true);
      expect((window as any).webkit.messageHandlers.domofilter.postMessage).toHaveBeenCalled();
    });

    it('should use operand fallback in iOS filterContainer', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });
      const postMessageMock = jest.fn();
      (window as any).webkit = { messageHandlers: { domofilter: { postMessage: postMessageMock } } };
      // Only operand, no operator
      const filter = [{ column: 'a', operand: 'IN', values: ['x'], dataType: 'STRING' }];
      Domo.filterContainer(filter as any, true);
      expect(postMessageMock).toHaveBeenCalledWith([
        { column: 'a', operand: 'IN', values: ['x'], dataType: 'STRING' }
      ]);
    });
  });

  describe('onFiltersUpdated', () => {
    it('should register and unregister onFiltersUpdated', () => {
      const cb = jest.fn();
      const unregister = (Domo as any).onFiltersUpdated(cb);
      expect(typeof unregister).toBe('function');
      unregister();
    });

    it('should handle filtersUpdated event', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdated(cb);
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      Domo.channel.port1.onmessage(makeMessageEvent({ event: 'filtersUpdated', filters }, [port]));
      expect(port.postMessage).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(filters);
    });
  });
});
