import { Json } from './json';
/**
 * This is from the XMLHttpRequest Documentation:
 * https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/send
 */

export type XMLHttpRequestBody =
  | string
  | Document
  | Blob
  | ArrayBufferView
  | ArrayBuffer
  | FormData
  | URLSearchParams
  | ReadableStream<Uint8Array>;

export type RequestBody = unknown;
