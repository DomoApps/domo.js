requirejs(['utils', '/dist/domo.js'], function(utils, domo) {
  try {
    utils.add(3, 4);
  } catch (err) {
    console.error('Error loading test library: ', err);
  }
    
  if (typeof domo === 'function' && typeof domo.get === 'function') {
    console.log('domo is loaded:', domo);
  } else {
    console.error('domo is not defined properly:', domo);
  }
});
