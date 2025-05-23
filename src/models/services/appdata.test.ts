import Domo from '../../domo';

describe('sendAppData', () => {
  beforeEach(() => {
    window.parent.postMessage = jest.fn();
  });

  it('should send app data successfully', () => {
    Domo.sendAppData('value');
    expect(window.parent.postMessage).toHaveBeenCalled();
  });
});