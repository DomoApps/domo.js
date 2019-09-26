/**	
 * Loose approximation of a JSON type	
 * From the TypeScript discussion: https://github.com/Microsoft/TypeScript/issues/1897	
 */	

export type Json =  boolean | number | string | null | JsonArray | JsonMap;	
export interface JsonMap {  [key: string]: Json; }	
export interface JsonArray extends Array<Json> {} 
