/**	
 * Loose approximation of a JSON type	
 * From the TypeScript discussion: https://github.com/Microsoft/TypeScript/issues/1897	
 */	

export type Json =  boolean | number | string | null | JsonArray | JsonMap;	
export interface JsonMap {  [key: string]: Json; }	
export interface JsonArray extends Array<Json> {} 

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
