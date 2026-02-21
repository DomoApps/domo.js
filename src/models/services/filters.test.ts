import Domo from '../../domo';
import { FilterDataTypes, FilterOperatorsString, FilterOperatorsNumeric } from '../interfaces/filter';

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
    
    // Clean up any global domofilter
    delete (globalThis as any).domofilter;
    
    // Set up default non-iOS environment
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 0
      },
      configurable: true
    });
    Object.defineProperty(globalThis, 'webkit', {
      value: undefined,
      configurable: true
    });
    Object.defineProperty(document, 'ontouchend', {
      value: undefined,
      configurable: true
    });
    
    Object.defineProperty(window, 'webkit', {
      value: { 
        messageHandlers: { 
          domofilter: { postMessage: jest.fn() }, 
          domovariable: { postMessage: jest.fn() } 
        } 
      },
      configurable: true
    });
  });

  afterEach(() => {
    // Clean up global domofilter after each test
    delete (globalThis as any).domofilter;
  });

  const setupIOSEnvironment = () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        maxTouchPoints: 5
      },
      configurable: true
    });
  };

  describe('filterContainer', () => {
    it('should call filterContainer', () => {
      Domo.filterContainer([
        { column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING }
      ], true);
      expect(window.parent.postMessage).toHaveBeenCalled();
    });

    it('should detect webkit and call messageHandlers', () => {
      setupIOSEnvironment();
      const filter = [{ column: 'a', operator: FilterOperatorsString.IN, values: ['x'], dataType: 'STRING' }];
      const postMessageMock = jest.fn();
      Object.defineProperty(window, 'webkit', {
        value: { messageHandlers: { domofilter: { postMessage: postMessageMock }, domovariable: { postMessage: jest.fn() } } },
        configurable: true
      });
      // Mock the global domofilter object that the code checks first
      (globalThis as any).domofilter = { postMessage: postMessageMock };
      Domo.filterContainer(filter as any, true);
      expect(postMessageMock).toHaveBeenCalled();
    });

    it('should support legacy operand property in filter', () => {
      const filter = [{ column: 'a', operand: FilterOperatorsString.IN, values: ['x'], dataType: FilterDataTypes.STRING }];
      Domo.filterContainer(filter as any, true);
      expect(window.parent.postMessage).toHaveBeenCalled();
    });

    it('should call webkit.messageHandlers.domofilter.postMessage for iOS in filterContainer', () => {
      setupIOSEnvironment();
      const postMessageMock = jest.fn();
      Object.defineProperty(window, 'webkit', {
        value: { messageHandlers: { domofilter: { postMessage: postMessageMock } } },
        configurable: true
      });
      // Set global domofilter to undefined so it falls back to webkit
      (globalThis as any).domofilter = undefined;
      const filter = [{ column: 'a', operator: 'IN', values: ['x'], dataType: 'STRING' }];
      Domo.filterContainer(filter as any, true);
      expect(postMessageMock).toHaveBeenCalled();
    });

    it('should use operand fallback in iOS filterContainer', () => {
      setupIOSEnvironment();
      const postMessageMock = jest.fn();
      Object.defineProperty(window, 'webkit', {
        value: { messageHandlers: { domofilter: { postMessage: postMessageMock } } },
        configurable: true
      });
      // Mock global domofilter to get the expected payload format
      (globalThis as any).domofilter = { postMessage: postMessageMock };
      // Only operand, no operator
      const filter = [{ column: 'a', operand: 'IN', values: ['x'], dataType: 'STRING' }];
      Domo.filterContainer(filter as any, true);
      expect(postMessageMock).toHaveBeenCalledWith(JSON.stringify([
        { column: 'a', operand: 'IN', values: ['x'], dataType: 'STRING' }
      ]));
    });
  });

  describe('onFiltersUpdated', () => {
    it('should register and unregister onFiltersUpdated', () => {
      const cb = jest.fn();
      const unregister = (Domo as any).onFiltersUpdated(cb);
      expect(typeof unregister).toBe('function');
      expect((Domo as any).listeners.onFiltersUpdated).toContain(cb);
      unregister();
      expect((Domo as any).listeners.onFiltersUpdated).not.toContain(cb);
    });

    it('should handle filtersUpdated event', () => {
      const cb = jest.fn();
      Domo.onFiltersUpdated(cb);
      const port = makeMockPort();
      const filters = [{ foo: 'bar' }];
      Domo.channel?.port1.onmessage?.(makeMessageEvent({ event: 'filtersUpdated', filters }, [port]));
      expect(port.postMessage).toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith(filters);
    });
  });

  describe('Filter type validation', () => {
    it('should accept valid Filter array', () => {
      const validFilters = [
        { column: 'name', operator: FilterOperatorsString.IN, values: ['John', 'Jane'], dataType: FilterDataTypes.STRING as FilterDataTypes.STRING },
        { column: 'age', operator: FilterOperatorsNumeric.GREATER_THAN, values: [18], dataType: FilterDataTypes.NUMERIC as FilterDataTypes.NUMERIC },
        { column: 'date', operator: FilterOperatorsNumeric.BETWEEN, values: [new Date('2023-01-01'), new Date('2023-12-31')], dataType: FilterDataTypes.DATE as FilterDataTypes.DATE }
      ];
      
      expect(() => {
        Domo.requestFiltersUpdate(validFilters);
      }).not.toThrow();
      
      expect(window.parent.postMessage).toHaveBeenCalled();
    });

    it('should accept null filters', () => {
      expect(() => {
        Domo.requestFiltersUpdate(null);
      }).not.toThrow();
      
      expect(window.parent.postMessage).toHaveBeenCalled();
    });

    it('should throw TypeError for non-array filters', () => {
      expect(() => {
        Domo.requestFiltersUpdate({ invalid: 'object' } as any);
      }).toThrow(TypeError);
      
      expect(() => {
        Domo.requestFiltersUpdate('invalid string' as any);
      }).toThrow(TypeError);
      
      expect(() => {
        Domo.requestFiltersUpdate(123 as any);
      }).toThrow(TypeError);
    });

    it('should throw TypeError for invalid Filter objects', () => {
      const invalidFilters = [
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'] }, // missing dataType
        { operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING }, // missing column
        { column: 'name', values: ['test'], dataType: FilterDataTypes.STRING }, // missing operator
        { column: 'name', operator: FilterOperatorsString.IN, dataType: FilterDataTypes.STRING }, // missing values
        { column: 123, operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING }, // column not string
        { column: 'name', operator: 'INVALID_OPERATOR', values: ['test'], dataType: FilterDataTypes.STRING }, // invalid operator
        { column: 'name', operator: FilterOperatorsString.IN, values: 'not-array', dataType: FilterDataTypes.STRING }, // values not array
        { column: 'name', operator: FilterOperatorsString.IN, values: ['test'], dataType: 'INVALID_TYPE' } // invalid dataType
      ];
      
      for (const invalidFilter of invalidFilters) {
        expect(() => {
          Domo.requestFiltersUpdate([invalidFilter as any]);
        }).toThrow(TypeError);
      }
    });

    it('should accept empty Filter array (clears all filters)', () => {
      expect(() => {
        Domo.requestFiltersUpdate([]);
      }).not.toThrow();

      expect(window.parent.postMessage).toHaveBeenCalled();
      const message = JSON.parse((window.parent.postMessage as jest.Mock).mock.calls[0][0]);
      expect(message.event).toBe('filter');
      expect(message.filter).toEqual([]);
    });

    it('should throw TypeError for mixed valid/invalid filters', () => {
      const mixedFilters = [
        { column: 'valid', operator: FilterOperatorsString.IN, values: ['test'], dataType: FilterDataTypes.STRING }, // valid
        { column: 'invalid', operator: 'INVALID_OPERATOR', values: ['test'], dataType: FilterDataTypes.STRING } // invalid
      ];
      
      expect(() => {
        Domo.requestFiltersUpdate(mixedFilters as any);
      }).toThrow(TypeError);
    });
  });
});
