import { DataFormats } from '../models/enums/data-formats';
import { QueryParams } from '../models/interfaces/query-params';
import { RequestOptions } from '../models/interfaces/request-options';
import { domoFormatToRequestFormat } from './data-helpers';

const HOST_WHITELIST = /^(?:[\w-]+\.)*(domo|domotech|domorig)\.(com|io)$/i;
const HOST_BLACKLIST = /domoapps/i;

/**
 * Checks if the HTTP status code represents a successful response (2xx).
 *
 * @param status - The HTTP status code to check.
 * @returns True if status is between 200 and 299, otherwise false.
 */
export function isSuccess(status: number) {
  return status >= 200 && status < 300;
}

/**
 * Determines if the given origin is a verified and allowed domain.
 *
 * @param origin - The origin URL to verify.
 * @returns True if the origin is HTTPS and matches the whitelist, but not the blacklist.
 */
export function isVerifiedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname;
    return HOST_WHITELIST.test(host) && !HOST_BLACKLIST.test(host);
  } catch {
    return false;
  }
}

/**
 * Parses the current window's query string into an object of key-value pairs.
 *
 * @returns An object containing query parameters as key-value pairs.
 */
export function getQueryParams(): QueryParams {
  const query = location.search.substr(1);
  let result: { [index: string]: string } = {};
  query.split("&").forEach(function (part) {
    const item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

/**
 * Sets the Accept header on the headers object based on the data format if the URL matches a data endpoint.
 *
 * @param headers - The headers object to set the Accept header on.
 * @param url - The request URL.
 * @param options - Optional request options that may specify a format.
 */
export function setFormatHeaders(
  headers: Record<string, string>,
  url: string,
  options?: RequestOptions
) {
  if (!headers || url?.indexOf("data/v") === -1) return;

  const requestFormat: DataFormats =
    options?.format !== undefined
      ? domoFormatToRequestFormat(options.format)
      : DataFormats.ARRAY_OF_OBJECTS;

  headers["Accept"] = requestFormat;
}
