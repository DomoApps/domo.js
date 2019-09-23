export = domo;

class domo {
  static post(url: string, body: any, options: { [index: string] : string }) {
    return domoHttp('POST', url, options, true, body);
  }
  
  static put(url: string, body: any, options: { [index: string] : string }) {
    return domoHttp('PUT', url, options, true, body);
  }
  
  static get(url: string, options: { [index: string] : string }) {
    return domoHttp('GET', url, options);
  }
  
  static delete(url: string, options: { [index: string] : string }) {
    return domoHttp('DELETE', url, options);
  }

  static getAll(urls: string[], options: { [index: string] : string }) {
    return Promise.all(urls.map(function(url){
      return domo.get(url, options);
    }));
  };
  
  /**
   * Let the domoapp optionally handle its own data updates.
   */
  static onDataUpdate(cb: any) {
    window.addEventListener('message', function(event) {
      if (!isVerifiedOrigin(event.origin))
        return;
  
      if (typeof event.data === 'string' && event.data.length > 0) {
        try {
          var message = JSON.parse(event.data);
          if (!message.hasOwnProperty('alias')) {
            return;
          }
  
          let alias = message.alias;
  
          // send acknowledgement to prevent autorefresh
          var ack = JSON.stringify({
            event: 'ack',
            alias: alias,
          });
          if(event.source instanceof Window) {
            event.source.postMessage(ack, event.origin);
          }
  
          // inform domo app which alias has been updated
          cb(alias);
        } catch(err) {
          let info = 'There was an error in onDataUpdate! It may be that our event listener caught ' +
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
  static navigate(url: string, isNewWindow: boolean) {
    var message = JSON.stringify({
      event: 'navigate',
      url: url,
      isNewWindow: isNewWindow
    });
    window.parent.postMessage(message, "*");
  }
  
  /**
   * Post a filter to the parent page/dashboard
   * @param {String} column 
   * @param {String} operator 
   * @param {Array} values 
   */
  static filterContainer(column: string, operator: string, values: any, dataType: any) {
    var userAgent = window.navigator.userAgent.toLowerCase(),
      safari = /safari/.test( userAgent ),
      ios = /iphone|ipod|ipad/.test( userAgent );
  
    var message = JSON.stringify({
      event: 'filter',
      filter: {
        columnName: column,
        operator: operator,
        values: values,
        dataType: dataType
      }
    });
  
    if(ios && !safari) {
      (window as any).webkit.messageHandlers.domofilter.postMessage({ column: column, operand: operator, values: values, dataType: dataType });
    }
    else {
      window.parent.postMessage(message, "*");
    }
  }
  
  static env = getQueryParams();
  
  static __util = {
    isVerifiedOrigin,
    getQueryParams,
    setFormatHeaders, 
    isSuccess
  }

};


function domoHttp(method: string, url: string, options: { [index: string] : string }, async?: any, body?: any) {
  options = options || {};

  // Return a new promise.
  return new Promise(function(resolve: any, reject: any) {
    // Do the usual XHR stuff
    var req = new XMLHttpRequest();
    if(async) {
      req.open(method, url, async);
    }
    else {
      req.open(method, url);
    }
    setFormatHeaders(req, url, options);
    setContentHeaders(req, options);
    setResponseType(req, options);

    req.onload = function() {
      var data;
      // This is called even on 404 etc so check the status
      if (isSuccess(req.status)) {
        
        if (['csv', 'excel'].includes(options.format) || !req.response){
          resolve(req.response);
        }
        if(options.responseType === 'blob') {
          resolve(new Blob([req.response], {type: req.getResponseHeader('content-type')}));
        }

        let responseStr = req.response;
        try {
          // if(!responseStr) {
          //   responseStr = "{}";
          // }
          data = JSON.parse(responseStr);
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
    if(body) {
      if (!options.contentType || options.contentType === 'application/json') {
        var json = JSON.stringify(body);
        // Make the request
        req.send(json);
      } else {
        req.send(body);
      }
    }
    else {
      req.send();
    }
  });
}

function isSuccess(status: number) {
  return status >= 200 && status < 300;
}

function isVerifiedOrigin(origin: any) {
  var whitelisted = origin.match('^https?://([^/]+[.])?(domo|domotech|domorig)\.(com|io)?(/.*)?$');
  var blacklisted = origin.match('(.*)\.(domoapps)\.(.*)');
  return !!whitelisted && !blacklisted;
}

function getQueryParams() {
  var query = location.search.substr(1);
  let result : { [index : string] : string} = {};
  query.split("&").forEach(function(part) {
    var item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

function setFormatHeaders(req: any, url: string, options: { [index: string] : string }){
  if (url.indexOf('data/v1') === -1 ) { return; }
  // set format
  let formatTypes : { [index: string] : string } = {
    'array-of-arrays': 'application/json',
    'csv': 'text/csv',
    'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  req.setRequestHeader('Accept', options.format ? formatTypes[options.format] || 'application/array-of-objects' : 'application/array-of-objects');
}

function setContentHeaders(req: any, options: { [index: string] : string }) {
  if (options.contentType) {
    // set content type if user passed option
    if(options.contentType !== 'multipart'){
      req.setRequestHeader('Content-Type', options.contentType);
    }
  }
  else {
    req.setRequestHeader('Content-Type','application/json');
  }
}

function setResponseType(req: any, options: { [index: string] : string }) {
  //set response type if user passed option
  if (options.responseType) {
      req.responseType = options.responseType;
  }
}