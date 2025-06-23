import { getToken } from "../constants/general";
import { setAuthTokenHeader, setContentHeaders } from "../../utils/domoutils";
import { setFormatHeaders } from "../../utils/general";
import { DataFormats } from "../enums/data-formats";
import { RequestMethods } from "../enums/request-methods";
import { RequestBody, RequestOptions, ObjectResponseBody, ArrayResponseBody, ResponseBody } from "../interfaces/request";

function domoHttp(method: RequestMethods, url: string, options: RequestOptions<'array-of-objects'>, body?: RequestBody): Promise<ObjectResponseBody[]>;
function domoHttp(method: RequestMethods, url: string, options: RequestOptions<'array-of-arrays'>, body?: RequestBody): Promise<ArrayResponseBody>;
function domoHttp(method: RequestMethods, url: string, options?: RequestOptions, body?: RequestBody): Promise<ResponseBody>;
function domoHttp<T>(method: RequestMethods, url: string, options?: RequestOptions, body?: RequestBody): Promise<T>;
async function domoHttp<T>(method: RequestMethods, url: string, options: RequestOptions = {}, body?: RequestBody): Promise<T> {
    const customFetch = (options as any).fetch as typeof fetch | undefined;
    const headers: Record<string, string> = {};
    setFormatHeaders(headers as any, url, options);
    setContentHeaders(headers as any, options);
    setAuthTokenHeader(headers as any, getToken());

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

function get(url: string, options: RequestOptions<'array-of-objects'>): Promise<ObjectResponseBody[]>;
function get(url: string, options: RequestOptions<'array-of-arrays'>): Promise<ArrayResponseBody>;
function get(url: string, options?: RequestOptions): Promise<ResponseBody>;
function get<T>(url: string, options?: RequestOptions): Promise<T>;
function get<T>(url: string, options?: RequestOptions): Promise<T> {
  const handle = this?.domoHttp ?? domoHttp;
  return handle(RequestMethods.GET, url, options);
}

function getAll(urls: string[], options: RequestOptions<'array-of-objects'>): Promise<ObjectResponseBody[][]>;
function getAll(urls: string[], options: RequestOptions<'array-of-arrays'>): Promise<ArrayResponseBody[]>;
function getAll(urls: string[], options?: RequestOptions): Promise<ResponseBody[]>;
function getAll<T>(urls: string[], options?: RequestOptions): Promise<T[]>;
function getAll<T = ResponseBody>(urls: string[], options?: RequestOptions): Promise<T[]> {
  const handle = this?.get ?? get;
  return Promise.all(urls.map(url => handle(url, options)));
};

function post(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody>;
function post<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T>;
function post<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T> {
  const handle = this?.domoHttp ?? domoHttp;
  return handle(RequestMethods.POST, url, options, body);
}

function put(url: string, body?: RequestBody, options?: RequestOptions): Promise<ResponseBody>;
function put<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T>;
function put<T>(url: string, body?: RequestBody, options?: RequestOptions): Promise<T> {
  const handle = this?.domoHttp ?? domoHttp;
  return handle(RequestMethods.PUT, url, options, body);
}

function trash(url: string, options?: RequestOptions): Promise<ResponseBody>;
function trash<T>(url: string, options?: RequestOptions): Promise<T>;
function trash<T>(url: string, options?: RequestOptions): Promise<T> {
  const handle = this?.domoHttp ?? domoHttp;
  return handle(RequestMethods.DELETE, url, options);
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
  if (options.responseType !== "blob" && ["csv", "excel"].includes(options.format))
    return response.text() as any as Promise<T>;
  
  if (options.responseType === "blob")
    return response.blob() as any as Promise<T>;

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

export { get, getAll, post, put, trash as delete, domoHttp };

