import { getToken } from "../constants/general";
import { setAuthTokenHeader, setContentHeaders } from "../../utils/domoutils";
import { setFormatHeaders } from "../../utils/general";
import { DataFormats } from "../enums/data-formats";
import { RequestMethods } from "../enums/request-methods";
import { RequestBody } from "../interfaces/request-body";
import { ObjectRequestOptions, ArrayRequestOptions, RequestOptions } from "../interfaces/request-options";
import { ObjectResponseBody, ArrayResponseBody, ResponseBody } from "../interfaces/response-body";

function domoHttp(method: RequestMethods, url: string, options: ObjectRequestOptions, async?: boolean, body?: RequestBody): Promise<ObjectResponseBody[]>;
function domoHttp(method: RequestMethods, url: string, options: ArrayRequestOptions, async?: boolean, body?: RequestBody): Promise<ArrayResponseBody>;
function domoHttp(method: RequestMethods, url: string, options?: RequestOptions, async?: boolean, body?: RequestBody): Promise<ResponseBody>;
function domoHttp<T>(method: RequestMethods, url: string, options?: RequestOptions, async?: boolean, body?: RequestBody): Promise<T>;
async function domoHttp<T>(method: RequestMethods, url: string, options: RequestOptions = {}, asyncFlag?: boolean, body?: RequestBody): Promise<T> {
    options = options || {};
    const customFetch = (options as any).fetch as typeof fetch | undefined;
    const headers: Record<string, string> = {};
    setFormatHeaders(headers as any, url, options);
    setContentHeaders(headers as any, options);
    setAuthTokenHeader(headers as any, getToken());

    if (asyncFlag === false)
      throw new Error("Synchronous requests are not supported in fetch. Use async requests.");

    const fetchOptions: RequestInit = {
      method,
      headers,
      body: serializeBody(body, options.contentType),
    };

    const fetchImpl = customFetch || fetch;
    let response: Response;
    try {
      response = await fetchImpl(url, fetchOptions);
    } catch (fetchErr: any) {
      throw buildError(undefined, fetchErr.message, '');
    }

    if (!response.ok) {
      let errorText = response.statusText;
      let errorBody = '';
      try {
        errorBody = await response.text();
        errorText = errorBody || errorText;
      } catch {}
      throw buildError(response, errorText, errorBody);
    }
    
    try {
      return await parseResponse<T>(response, options);
    } catch (err: any) {
      if (err && (err.status || err.status === 0)) throw err;

      const error: any = new Error(`domoHttp error: ${err.message}`);
      error.originalError = err;
      throw error;
    }
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

function serializeBody(body: RequestBody, contentType?: string): any {
    if (!body) return undefined;
    if (!contentType || contentType === DataFormats.JSON) {
      return JSON.stringify(body);
    }
    return body as any;
  }

function buildError(response: Response | undefined, errorText: string, errorBody: string): Error {
  const error: any = new Error(response ? `HTTP error ${response.status}: ${errorText}` : errorText);
  if (response) {
    error.status = response.status;
    error.statusText = response.statusText;
    error.body = errorBody;
    error.headers = {};
    if (response.headers && typeof response.headers.forEach === 'function') {
      response.headers.forEach((value, key) => {
        error.headers[key] = value;
      });
    }
  }
  return error;
}

function parseResponse<T>(response: Response, options: RequestOptions): Promise<T> {
  if (["csv", "excel"].includes(options.format)) {
    if (options.responseType === "blob") {
      return response.blob() as any as Promise<T>;
    }
    return response.text() as any as Promise<T>;
  }
  if (options.responseType === "blob") {
    return response.blob() as any as Promise<T>;
  }
  return response.text().then((text) => {
    if (!text) return "" as any as T;
    try {
      return JSON.parse(text) as T;
    } catch (ex: any) {
      const error: any = new Error("Invalid JSON response: " + ex.message);
      error.responseText = text;
      throw error;
    }
  });
}

export { get, post, put, trash as delete, domoHttp };

