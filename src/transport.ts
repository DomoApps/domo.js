/**
 * Shared transport layer for HTTP methods.
 *
 * All namespace services (appdb, data, ai, workflow, codeEngine) import from
 * here instead of directly from http.ts. When `Domo.extend()` overrides
 * `get`, `post`, `put`, or `delete`, it also updates these references so
 * that every service sees the override.
 */
import {
  get as defaultGet,
  post as defaultPost,
  put as defaultPut,
  delete as defaultDelete,
} from "./models/services/http";

export const transport = {
  get: defaultGet,
  post: defaultPost,
  put: defaultPut,
  delete: defaultDelete,
};
