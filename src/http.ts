import { 
    RequestMethods, RequestOptions, RequestBody, 
    ResponseBody, ObjectRequestOptions, ObjectResponseBody, 
    ArrayRequestOptions, ArrayResponseBody, 
    DataFormats
} from "./models";
import { getToken } from "./models/constants/general";
import { setAuthTokenHeader, setContentHeaders, setResponseType } from "./utils/domoutils";
import { isSuccess, setFormatHeaders } from "./utils/general";

function domoHttp(method: RequestMethods, url: string, options: ObjectRequestOptions, async?: boolean, body?: RequestBody): Promise<ObjectResponseBody[]>;
function domoHttp(method: RequestMethods, url: string, options: ArrayRequestOptions, async?: boolean, body?: RequestBody): Promise<ArrayResponseBody>;
function domoHttp(method: RequestMethods, url: string, options?: RequestOptions, async?: boolean, body?: RequestBody): Promise<ResponseBody>;
function domoHttp<T>(method: RequestMethods, url: string, options?: RequestOptions, async?: boolean, body?: RequestBody): Promise<T>;
function domoHttp<T>(method: RequestMethods, url: string, options: RequestOptions = {}, async?: boolean, body?: RequestBody): Promise<T> {
    options = options || {};
    return new Promise(function (
      resolve: (value?: T) => void,
      reject: (reason?: Error) => void
    ) {
      // Do the usual XHR stuff
      let req: XMLHttpRequest = new XMLHttpRequest();
      if (async) {
        req.open(method, url, async);
      } else {
        req.open(method, url);
      }
      setFormatHeaders(req, url, options);
      setContentHeaders(req, options);
      setAuthTokenHeader(req, getToken());
      setResponseType(req, options);

      req.onload = function () {
        let data;
        // This is called even on 404 etc so check the status
        if (isSuccess(req.status)) {
          if (["csv", "excel"].includes(options.format) || !req.response) {
            resolve(req.response);
            return;
          }
          if (options.responseType === "blob") {
            resolve(
              new Blob([req.response], {
                type: req.getResponseHeader("content-type"),
              }) as any as T
            );
            return;
          }

          let responseStr = req.response;
          try {
            data = JSON.parse(responseStr);
          } catch (ex) {
            reject(Error("Invalid JSON response: " + ex.message));
            return;
          }
          resolve(data as T);
        } else {
          reject(Error(req.statusText));
        }
      };

      // Handle network errors
      req.onerror = function () {
        reject(Error("Network Error"));
      };

      // Make the request
      if (body) {
        if (!options.contentType || options.contentType === DataFormats.JSON) {
          const json = JSON.stringify(body);
          // Make the request
          req.send(json);
        } else {
          // body can no longer be JSON
          req.send(body as Document | XMLHttpRequestBodyInit);
        }
      } else {
        req.send();
      }
    });
}

function get(url: string, options: ObjectRequestOptions): Promise<ObjectResponseBody[]>;
function get(url: string, options: ArrayRequestOptions): Promise<ArrayResponseBody>;
function get(url: string, options?: RequestOptions): Promise<ResponseBody>;
function get<T>(url: string, options?: RequestOptions): Promise<T>;
function get<T>(url: string, options?: RequestOptions): Promise<T> {
  return domoHttp<T>(RequestMethods.GET, url, options);
}

function post(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody>;
function post<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T>;
function post<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T> {
  return domoHttp<T>(RequestMethods.POST, url, options, true, body);
}

function put(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody>;
function put<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T>;
function put<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T> {
  return domoHttp<T>(RequestMethods.PUT, url, options, true, body);
}

function trash(url: string, options?: RequestOptions): Promise<ResponseBody>;
function trash<T>(url: string, options?: RequestOptions): Promise<T>;
function trash<T>(url: string, options?: RequestOptions): Promise<T> {
  return domoHttp<T>(RequestMethods.DELETE, url, options);
}

export { get, post, put, trash as delete, domoHttp };