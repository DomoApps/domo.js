requirejs(['/dist/domo.js'], function(domo) {
  assertDomoExists(domo);
  assertOriginVerified(domo);
  domo.get('https://jsonplaceholder.typicode.com/users').then(data => {
    assert(!!data, true, 'failed request');
    assert(data.length > 0, true, 'got an empty set of data');
  });
  domo.post('https://jsonplaceholder.typicode.com/posts', {title: 'foo', body: 'bar', userId: 1}).then(data => {
    assert(!!data, true, 'failed request');
    assert(data.id == 101, true, 'failed request, got an empty set of data', data);
    assert(data.title === 'foo', true, 'failed request, got an empty set of data', data);
    assert(data.body === 'bar', true, 'failed request, got an empty set of data', data);
    assert(data.userId == 1, true, 'failed request, got an empty set of data', data);
  });
});
