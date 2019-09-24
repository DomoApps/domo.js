/**
 * Loose approximation of a JSON type
 * From the TypeScript discussion: https://github.com/Microsoft/TypeScript/issues/1897
 */
export declare type Json = boolean | number | string | null | JsonArray | JsonMap;
interface JsonMap {
    [key: string]: Json;
}
interface JsonArray extends Array<Json> {
}
export {};
