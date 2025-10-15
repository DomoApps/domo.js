import { DataFormats } from '../models/enums/data-formats';
import { QueryParams, RequestOptions } from '../models/interfaces/request';
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

/**
 * Generates a unique identifier using the crypto API if available, otherwise falls back to a random string.
 * 
 * @returns A unique identifier as a string.
 */
export function generateUniqueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  
  // Fallback: simple random string (not RFC4122 compliant, but sufficient for test environments)
  const BASE_HEX = 16;
  return 'xxxxxxxxyxxxxyxxxyxxxxyxxxxyxxxxy'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * BASE_HEX) | 0;
    return r.toString(BASE_HEX);
  });
}

/**
 * Detects if the current device is running iOS using multiple detection methods.
 * This function provides more reliable iOS detection than simple user agent matching.
 * 
 * @returns True if the device is running iOS, false otherwise.
 */
export function isIOS(): boolean {
  // Early return if not in browser environment
  if (globalThis.window === undefined || globalThis.navigator === undefined) {
    return false;
  }

  // Use the navigator that's actually available (in tests, globalThis.navigator might be mocked)
  const navigator = globalThis.navigator;
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Primary iOS device detection via user agent
  // Covers iPhone, iPad, iPod touch, and iPad in desktop mode
  const hasIOSUserAgent = /(?:iphone|ipad|ipod)/.test(userAgent);
  
  // Detect iPad in desktop mode (iOS 13+)
  // iPad in desktop mode reports as macOS but has touch capabilities
  const isPossibleIPadDesktopMode = /mac os x/.test(userAgent) && 
    'ontouchend' in document &&
    navigator.maxTouchPoints > 1;
  
  // Check for iOS-specific APIs
  const hasIOSAPIs = (globalThis as any).webkit?.messageHandlers !== undefined;
  
  // Additional check for standalone mode (PWA on iOS)
  const isStandalone = (navigator as any).standalone === true;
  
  // iOS devices typically have specific screen dimensions and pixel ratios
  // This helps catch edge cases where user agent might be modified
  const hasIOSScreenCharacteristics = globalThis.screen && (
    // iPhone dimensions (various models)
    (globalThis.screen.width === 375 && globalThis.screen.height === 667) || // iPhone 6/7/8
    (globalThis.screen.width === 414 && globalThis.screen.height === 736) || // iPhone 6/7/8 Plus
    (globalThis.screen.width === 375 && globalThis.screen.height === 812) || // iPhone X/XS/11 Pro
    (globalThis.screen.width === 414 && globalThis.screen.height === 896) || // iPhone XR/XS Max/11/11 Pro Max
    (globalThis.screen.width === 390 && globalThis.screen.height === 844) || // iPhone 12/12 Pro/13/13 Pro
    (globalThis.screen.width === 428 && globalThis.screen.height === 926) || // iPhone 12/13 Pro Max
    (globalThis.screen.width === 393 && globalThis.screen.height === 852) || // iPhone 14 Pro
    (globalThis.screen.width === 430 && globalThis.screen.height === 932) || // iPhone 14 Pro Max
    // iPad dimensions
    (globalThis.screen.width === 768 && globalThis.screen.height === 1024) || // iPad
    (globalThis.screen.width === 834 && globalThis.screen.height === 1112) || // iPad Pro 10.5"
    (globalThis.screen.width === 834 && globalThis.screen.height === 1194) || // iPad Pro 11"
    (globalThis.screen.width === 1024 && globalThis.screen.height === 1366) || // iPad Pro 12.9"
    // Consider high pixel density
    globalThis.devicePixelRatio >= 2
  );
  
  // Combine all detection methods
  return hasIOSUserAgent || 
         isPossibleIPadDesktopMode || 
         (hasIOSAPIs && (isStandalone || hasIOSScreenCharacteristics));
}