import {
  RequestMethods,
  RequestOptions,
  ObjectRequestOptions,
  ArrayRequestOptions,
  DataFormats,
  QueryParams,
  FilterDataTypes,
  FilterOperators,
  RequestBody,
  XMLHttpRequestBody,
  ResponseBody,
  ObjectResponseBody,
  ArrayResponseBody,
} from './models';
import { domoFormatToRequestFormat } from './utils/data-helpers';

export = domo;

class domo {
  static post(url: string, body?: RequestBody, options?: ObjectRequestOptions): Promise<ObjectResponseBody[]>;
  static post(url: string, body?: RequestBody, options?: ArrayRequestOptions): Promise<ArrayResponseBody>;
  static post(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody>;
  static post(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody> {
    return domoHttp(RequestMethods.POST, url, options, true, body);
  }
  
  static put(url: string, body?: RequestBody, options?: ObjectRequestOptions): Promise<ObjectResponseBody[]>;
  static put(url: string, body?: RequestBody, options?: ArrayRequestOptions): Promise<ArrayResponseBody>;
  static put(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody>;
  static put(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody> {
    return domoHttp(RequestMethods.PUT, url, options, true, body);
  }
  
  static get(url: string, options?: ObjectRequestOptions): Promise<ObjectResponseBody[]>;
  static get(url: string, options?: ArrayRequestOptions): Promise<ArrayResponseBody>;
  static get(url: string, options?: RequestOptions): Promise<ResponseBody>;
  static get(url: string, options?: RequestOptions): Promise<ResponseBody> {
    return domoHttp(RequestMethods.GET, url, options);
  }
  
  static delete(url: string, options?: ObjectRequestOptions): Promise<ObjectResponseBody[]>;
  static delete(url: string, options?: ArrayRequestOptions): Promise<ArrayResponseBody>;
  static delete(url: string, options?: RequestOptions): Promise<ResponseBody>;
  static delete(url: string, options?: RequestOptions): Promise<ResponseBody> {
    return domoHttp(RequestMethods.DELETE, url, options);
  }

  static getAll(urls: string[], options?: ObjectRequestOptions): Promise<ObjectResponseBody[][]>;
  static getAll(urls: string[], options?: ArrayRequestOptions): Promise<ArrayResponseBody[]>;
  static getAll(urls: string[], options?: RequestOptions): Promise<ResponseBody[]>;
  static getAll(urls: string[], options?: RequestOptions): Promise<ResponseBody[]> {
    return Promise.all(urls.map(function(url){
      return domo.get(url, options);
    }));
  };
  
  /**
   * Let the domoapp optionally handle its own data updates.
   */
  static onDataUpdate(cb: (alias: string) => void) {
    window.addEventListener('message', function(event: MessageEvent) {
      if (!isVerifiedOrigin(event.origin))
        return;
  
      if (typeof event.data === 'string' && event.data.length > 0) {
        try {
          const message = JSON.parse(event.data);
          if (!message.hasOwnProperty('alias')) {
            return;
          }
  
          const alias = message.alias;
  
          // send acknowledgement to prevent autorefresh
          const ack = JSON.stringify({
            event: 'ack',
            alias: alias,
          });
          if(event.source instanceof Window) {
            event.source.postMessage(ack, event.origin);
          }
  
          // inform domo app which alias has been updated
          cb(alias);
        } catch(err) {
          const info = 'There was an error in onDataUpdate! It may be that our event listener caught ' +
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
    const message = JSON.stringify({
      event: 'navigate',
      url: url,
      isNewWindow: isNewWindow
    });
    window.parent.postMessage(message, "*");
  }
  
  static filterContainer(column: string, operator: FilterOperators, values: string[], dataType: FilterDataTypes.STRING): void;
  static filterContainer(column: string, operator: FilterOperators, values: number[], dataType: FilterDataTypes.NUMERIC): void;
  static filterContainer(column: string, operator: FilterOperators, values: Date[], dataType: FilterDataTypes.DATE | FilterDataTypes.DATETIME): void;
  static filterContainer(column: string, operator: FilterOperators, values: (string | number | Date)[], dataType: FilterDataTypes): void {
    const userAgent = window.navigator.userAgent.toLowerCase(),
      safari = /safari/.test( userAgent ),
      ios = /iphone|ipod|ipad/.test( userAgent );
  
    const message = JSON.stringify({
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

function domoHttp(method: RequestMethods, url: string, options: ObjectRequestOptions, async?: boolean, body?: RequestBody): Promise<ObjectResponseBody[]>;
function domoHttp(method: RequestMethods, url: string, options: ArrayRequestOptions, async?: boolean, body?: RequestBody): Promise<ArrayResponseBody>;
function domoHttp(method: RequestMethods, url: string, options: RequestOptions, async?: boolean, body?: RequestBody): Promise<ResponseBody>;
function domoHttp(method: RequestMethods, url: string, options: RequestOptions, async?: boolean, body?: RequestBody): Promise<ResponseBody> {
  options = options || {};
  return new Promise(function(resolve: (value?: ResponseBody) => void, reject: (reason?: Error) => void) {
    // Do the usual XHR stuff
    let req: XMLHttpRequest = new XMLHttpRequest();
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
      let data;
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
          reject(Error('Invalid JSON response'));
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
      if (!options.contentType || options.contentType === DataFormats.JSON) {
        const json = JSON.stringify(body);
        // Make the request
        req.send(json);
      } else {
        // body can no longer be JSON
        req.send(body as XMLHttpRequestBody);
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

function isVerifiedOrigin(origin: string) {
  const whitelisted = origin.match('^https?://([^/]+[.])?(domo|domotech|domorig)\.(com|io)?(/.*)?$');
  const blacklisted = origin.match('(.*)\.(domoapps)\.(.*)');
  return !!whitelisted && !blacklisted;
}

function getQueryParams(): QueryParams {
  const query = location.search.substr(1);
  let result : { [index : string] : string} = {};
  query.split("&").forEach(function(part) {
    const item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

function setFormatHeaders(req: XMLHttpRequest, url: string, options?: RequestOptions){
  if (url.indexOf('data/v1') === -1 ) { return; }
  // set format
  const requestFormat: DataFormats = (options.format !== undefined)
    ? (domoFormatToRequestFormat(options.format)) 
    : (DataFormats.DEFAULT);

  req.setRequestHeader('Accept', requestFormat);
}

function setContentHeaders(req: XMLHttpRequest, options?: RequestOptions) {
  if (options.contentType) {
    // set content type if user passed option
    if(options.contentType !== 'multipart'){
      req.setRequestHeader('Content-Type', options.contentType);
    }
  }
  else {
    req.setRequestHeader('Content-Type', DataFormats.JSON);
  }
}

function setResponseType(req: XMLHttpRequest, options?: RequestOptions) {
  //set response type if user passed option
  if (options.responseType !== undefined) {
    req.responseType = options.responseType;
  }
}