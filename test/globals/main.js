if (typeof domo === 'function' && typeof domo.get === 'function') {
  console.log('domo is loaded:', domo);
} else {
  console.error('domo is not defined properly:', domo);
}
