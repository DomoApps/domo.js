require('es6-promise').polyfill(); // Promise polyfill for older browsers

function domo(){};

module.exports = domo;

domo.get = function(url, options) {
  options = options || {};

  // Return a new promise.
  return new Promise(function(resolve, reject) {
    // Do the usual XHR stuff
    var req = new XMLHttpRequest();

    req.open('GET', url);
    
    setFormatHeaders(req, url);

    req.onload = function() {
      var data;
      // This is called even on 404 etc so check the status
      if (req.status == 200) {

        if (options.format === 'csv' || options.format === 'excel'){
          resolve(req.response);
        }

        try {
          data = JSON.parse(req.response);
        }
        catch (ex){
          reject(Error("Invalid JSON response"));
          return;
        }
        // Resolve the promise with the response text
        resolve(data);
      }
      else {
        // Otherwise reject with the status text
        // which will hopefully be a meaningful error
        reject(Error(req.statusText));
      }
    };

    // Handle network errors
    req.onerror = function() {
      reject(Error("Network Error"));
    };

    // Make the request
    req.send();
  });
}

domo.getAll = function(urls, options) {
  return Promise.all(urls.map(function(url){
    return domo.get(url, options);
  }));
};

/**
 * Let the domoapp optionally handle its own data updates.
 */
domo.onDataUpdate = function(cb){
  window.addEventListener('message', function(event) {
    var message = JSON.parse(event.data);

    // send acknowledgement to prevent autorefresh
    var ack = JSON.stringify({
      event: 'ack',
      alias: message.alias
    });
    event.source.postMessage(ack, event.origin);

    // inform domo app which alias has been updated
    cb(message.alias);
  });
};

/**
 * Request a navigation change
 */
domo.navigate = function(url, isNewWindow){
  var message = JSON.stringify({
    event: 'navigate',
    url: url,
    isNewWindow: isNewWindow
  });
  window.parent.postMessage(message, "*");
}

domo.env = getQueryParams();

function getQueryParams() {
  var query = location.search.substr(1);
  var result = {};
  query.split("&").forEach(function(part) {
    var item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

function setFormatHeaders(req, url){
  if (url.indexOf('data/v1') === -1 ) { return; }
  
  // set format
  if (options.format === 'array-of-arrays'){
    req.setRequestHeader('Accept', 'application/json');
  }
  else if (options.format === 'csv'){
    req.setRequestHeader('Accept', 'text/csv');
  }
  else if (options.format === 'excel'){
    req.setRequestHeader('Accept', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  else{
    req.setRequestHeader('Accept', 'application/array-of-objects');
  }
}
