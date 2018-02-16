require('es6-promise').polyfill(); // Promise polyfill for older browsers

function domo(){};

module.exports = domo;
domo.post = function(url, body, options) {
  options = options || {};

  return new Promise(function(resolve, reject) {
    var req = new XMLHttpRequest();
    req.open('POST', url, true);
    setContentHeaders(req, url, options);

    req.onload = function() {
      // This is called even on 404 etc so check the status
      if (isSuccess(req.status)) {
        try {
          if(req.response) {
            resolve(JSON.parse(req.response));
          } else {
            resolve();
          }
        } catch(e) {
          reject(req.response);
        }
      }
      else {
        // Otherwise reject with the status text
        // which will hopefully be a meaningful error
        reject(Error(req.statusText));
      }
    };

    // Handle network errors
    req.onerror = function(error) {
      console.error(error);
      reject(Error("Network Error"));
    };
    // If we are not overriding the contentType or it is application/json then stringify.
    if (!options.contentType || options.contentType === 'application/json') {
      var json = JSON.stringify(body);
      // Make the request
      req.send(json);
    } else {
      req.send(body);
    }
  });
}

domo.put = function(url, body, options) {
  options = options || {};

  return new Promise(function(resolve, reject) {
    var req = new XMLHttpRequest();
    req.open('PUT', url, true);
    setContentHeaders(req, url, options);

    req.onload = function() {
      // This is called even on 404 etc so check the status
      if (isSuccess(req.status)) {
        try {
          if(req.response) {
            resolve(JSON.parse(req.response));
          } else {
            resolve();
          }
        } catch(e) {
          reject(req.response);
        }
      }
      else {
        // Otherwise reject with the status text
        // which will hopefully be a meaningful error
        reject(Error(req.statusText));
      }
    };

    // Handle network errors
    req.onerror = function(error) {
      console.error(error);
      reject(Error("Network Error"));
    };
    // If we are not overriding the contentType or it is application/json then stringify.
    if (!options.contentType || options.contentType === 'application/json') {
      var json = JSON.stringify(body);
      // Make the request
      req.send(json);
    } else {
      req.send(body);
    }
  });
}

domo.get = function(url, options) {
  options = options || {};

  // Return a new promise.
  return new Promise(function(resolve, reject) {
    // Do the usual XHR stuff
    var req = new XMLHttpRequest();
    req.open('GET', url);
    setFormatHeaders(req, url, options);

    req.onload = function() {
      var data;
      // This is called even on 404 etc so check the status
      if (isSuccess(req.status)) {

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

domo.delete = function(url, options) {
  options = options || {};

  // Return a new promise.
  return new Promise(function(resolve, reject) {
    // Do the usual XHR stuff
    var req = new XMLHttpRequest();
    req.open('DELETE', url);
    setFormatHeaders(req, url, options);

    req.onload = function() {
      // This is called even on 404 etc so check the status
      if (isSuccess(req.status)) {
        try {
          if(req.response) {
            resolve(JSON.parse(req.response));
          } else {
            resolve();
          }
        } catch(e) {
          reject(req.response);
        }
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
    if (!isVerifiedOrigin(event.origin))
      return;

    if (typeof event.data === 'string' && event.data.length > 0) {
      try {
        var message = JSON.parse(event.data);
        if (!message.hasOwnProperty('alias')) {
          return;
        }

        var alias = message.alias;

        // send acknowledgement to prevent autorefresh
        var ack = JSON.stringify({
          event: 'ack',
          alias: alias,
        });
        event.source.postMessage(ack, event.origin);

        // inform domo app which alias has been updated
        cb(alias);
      } catch(err) {
        var info = 'There was an error in domo.onDataUpdate! It may be that our event listener caught ' +
                   'a message from another source and tried to parse it, so your update still may have worked. ' +
                   'If you would like more info, here is the error: \n'
        console.warn(info, err);
      }
    }
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

domo.__util = {
  isVerifiedOrigin,
  getQueryParams,
  setFormatHeaders, 
  isSuccess
}

function isSuccess(status) {
  return status >= 200 && status < 300;
}

function isVerifiedOrigin(origin) {
  var whitelisted = origin.match('^https?://([^/]+[.])?(domo|domotech|domorig)\.(com|io)?(/.*)?$');
  var blacklisted = origin.match('(.*)\.(domoapps)\.(.*)');
  return !!whitelisted && !blacklisted;
}

function getQueryParams() {
  var query = location.search.substr(1);
  var result = {};
  query.split("&").forEach(function(part) {
    var item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

function setFormatHeaders(req, url, options){
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
  else {
    req.setRequestHeader('Accept', 'application/array-of-objects');
  }
}

function setContentHeaders(req, url, options) {
  if (options.contentType) {
    // set content type if user passed option
    req.setRequestHeader('Content-Type', options.contentType);
  }
  else {
    req.setRequestHeader('Content-Type','application/json');
  }
}
