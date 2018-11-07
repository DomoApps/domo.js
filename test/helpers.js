function assert(result, value, message) {
  if (value !== result) {
    console.log(message);
    return false;
  }
  return true;
}

function assertDomoExists(domo) {
  var arr = [
    assert(typeof domo === 'function', true, 'domo is not defined properly'),
    assert(typeof domo.get === 'function', true, 'domo.get is not defined properly'),
    assert(typeof domo.put === 'function', true, 'domo.put is not defined properly'),
    assert(typeof domo.post === 'function', true, 'domo.post is not defined properly'),
    assert(typeof domo.delete === 'function', true, 'domo.delete is not defined properly'),
  ]

  if (arr.every(function(result) { return result })) {
    console.log('domo is loaded:', domo);
  } else {
    console.error('domo is not defined properly:', domo);
  }
}

function assertOriginVerified(domo) {
  var isVerifiedOrigin = domo.__util['isVerifiedOrigin'];
  var arr = [
    assert(isVerifiedOrigin('https://www.domo.com'), true, 'https://www.domo.com failed test'),
    assert(isVerifiedOrigin('https://www.domorig.io'), true, 'https://www.domorig.io failed test'),
    assert(isVerifiedOrigin('https://www.domotech.io'), true, 'https://www.domotech.io failed test'),
    assert(isVerifiedOrigin('https://domo.demo.domo.com'), true, 'https://domo.demo.domo.com failed test'),
    assert(isVerifiedOrigin('https://domoapps.prod3.domo.com'), false, 'https://domoapps.prod3.domo.com failed test'),
    assert(isVerifiedOrigin('https://qa2staging.fastage1.domotech.io/auth/index'), true, 'https://qa2staging.fastage1.domotech.io/auth/index failed test'),
    assert(isVerifiedOrigin('https://www.somethingk.com'), false, 'https://www.somethingk.com failed test'),
    assert(isVerifiedOrigin('https://www.domo.com.bad.io'), false, 'https://www.domo.com.bad.io failed test'),
    assert(isVerifiedOrigin('https://www.domo.com/stuff'), true, 'https://www.domo.com/stuff failed test'),
    assert(isVerifiedOrigin('https://www.domoapps-test.domo.com/stuff'), false, 'https://www.domoapps-test.domo.com/stuff failed test'),
    assert(isVerifiedOrigin('https://www.test-domoapps.domo.com/stuff'), false, 'https://www.test-domoapps.domo.com/stuff failed test')
  ]

  if (arr.every(function (result) {
    return result;
  })) {
    console.log('domo origin check passed');
  } else {
    console.log('domo origin check failed');
  }
}

