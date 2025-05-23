import Domo from '../../domo';

describe('sendVariables', () => {
  beforeEach(() => {
    window.parent.postMessage = jest.fn();
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      configurable: true
    });
    (window as any).webkit = { messageHandlers: { domovariable: { postMessage: jest.fn() } } };
  });

  it('should call sendVariables', () => {
    Domo.sendVariables('vars');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });

  it('should use webkit.messageHandlers.domovariable in sendVariables for iOS', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      configurable: true
    });
    (window as any).webkit = { messageHandlers: { domovariable: { postMessage: jest.fn() } } };
    Domo.sendVariables('vars-ios');
    expect((window as any).webkit.messageHandlers.domovariable.postMessage).toHaveBeenCalledWith('vars-ios');
  });
});
