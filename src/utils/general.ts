// General utility functions for domo
import { DataFormats, RequestOptions, QueryParams } from '../models';
import { domoFormatToRequestFormat } from './data-helpers';

const HOST_WHITELIST = /^(?:[\w-]+\.)*(domo|domotech|domorig)\.(com|io)$/i;
const HOST_BLACKLIST = /domoapps/i;

function isSuccess(status: number) {
  return status >= 200 && status < 300;
}

function isVerifiedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname;
    return HOST_WHITELIST.test(host) && !HOST_BLACKLIST.test(host);
  } catch {
    return false;
  }
}

function getQueryParams(): QueryParams {
  const query = location.search.substr(1);
  let result: { [index: string]: string } = {};
  query.split("&").forEach(function (part) {
    const item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

function setFormatHeaders(
  req: XMLHttpRequest,
  url: string,
  options?: RequestOptions
) {
  if (url.indexOf("data/v") === -1) {
    return;
  }
  // set format
  const requestFormat: DataFormats =
    options && options.format !== undefined
      ? domoFormatToRequestFormat(options.format)
      : DataFormats.DEFAULT;

  req.setRequestHeader("Accept", requestFormat);
}

export { isSuccess, isVerifiedOrigin, getQueryParams, setFormatHeaders };
