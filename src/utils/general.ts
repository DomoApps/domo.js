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
 *          Also allows localhost and file:// for development/testing.
 */
export function isVerifiedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);

    // Allow localhost and *.localhost subdomains for development (both http and https)
    if (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname.endsWith('.localhost')) {
      return true;
    }

    // Allow file:// protocol for local file testing
    if (url.protocol === 'file:') {
      return true;
    }

    // Production: require HTTPS and check whitelist/blacklist
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
 * Detects if the current device is running iOS using reliable detection methods.
 * Uses a multi-factor approach to avoid false positives while removing brittle screen dimension checks.
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
  // Covers iPhone, iPad, iPod touch
  const hasIOSUserAgent = /(?:iphone|ipad|ipod)/.test(userAgent);

  // Detect iPad in desktop mode (iOS 13+)
  // iPad in desktop mode reports as macOS but has touch capabilities
  const isPossibleIPadDesktopMode = /mac os x/.test(userAgent) &&
    'ontouchend' in document &&
    navigator.maxTouchPoints > 1;

  // For edge cases where user agent might be modified or unreliable,
  // require MULTIPLE iOS-specific indicators to avoid false positives
  const hasIOSAPIs = (globalThis as any).webkit?.messageHandlers !== undefined;
  const isStandalone = (navigator as any).standalone === true;
  const hasMobileScreenRatio = globalThis.screen &&
    globalThis.devicePixelRatio &&
    globalThis.devicePixelRatio >= 2 &&
    (globalThis.screen.width < 1024 || globalThis.screen.height < 1024); // Mobile-like dimensions

  // Strong evidence: clear iOS user agent or iPad desktop mode
  if (hasIOSUserAgent || isPossibleIPadDesktopMode) {
    return true;
  }

  // Weaker evidence: require multiple indicators to avoid false positives
  // This prevents test environments from being detected as iOS unless they
  // explicitly mock multiple iOS-specific features
  const multipleIndicators = [hasIOSAPIs, isStandalone, hasMobileScreenRatio].filter(Boolean).length;
  return multipleIndicators >= 2;
}

/**
 * Detects if the current device is any mobile device including iOS, Android, Windows Phone, BlackBerry, etc.
 * This is a comprehensive mobile detection function that encompasses all mobile platforms.
 * Uses a multi-factor approach to avoid false positives.
 *
 * @returns True if the device is any mobile device (including iOS), false otherwise.
 */
export function isMobile(): boolean {
  // First check if it's iOS using the dedicated iOS detection
  if (isIOS()) {
    return true;
  }

  // Early return if not in browser environment
  if (globalThis.window === undefined || globalThis.navigator === undefined) {
    return false;
  }

  // Use the navigator that's actually available (in tests, globalThis.navigator might be mocked)
  const navigator = globalThis.navigator;
  const userAgent = navigator.userAgent.toLowerCase();

  // Primary mobile device detection via user agent
  // Covers Android, Windows Phone, BlackBerry, and other mobile platforms
  const hasMobileUserAgent = /android|webos|blackberry|iemobile|opera mini|mobile|phone/.test(userAgent);

  // Strong evidence: clear mobile user agent
  if (hasMobileUserAgent) {
    return true;
  }

  // For edge cases where user agent might be modified or unreliable,
  // require MULTIPLE mobile-specific indicators to avoid false positives
  const hasMobileAPIs = (globalThis as any).domovariable !== undefined ||
                         (globalThis as any).domofilter !== undefined;
  const hasTouchSupport = 'ontouchstart' in globalThis.window ||
                         navigator.maxTouchPoints > 0;
  const hasMobileScreenRatio = globalThis.screen &&
    globalThis.devicePixelRatio &&
    globalThis.devicePixelRatio >= 1 &&
    (globalThis.screen.width < 1024 || globalThis.screen.height < 1024); // Mobile-like dimensions

  // Weaker evidence: require multiple indicators to avoid false positives
  // This prevents test environments from being detected as mobile unless they
  // explicitly mock multiple mobile-specific features
  const multipleIndicators = [hasMobileAPIs, hasTouchSupport, hasMobileScreenRatio].filter(Boolean).length;
  return multipleIndicators >= 2;
}