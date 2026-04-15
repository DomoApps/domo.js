import { transport } from "../../transport";
import { RequestOptions } from "../interfaces/request";

const COLLECTIONS = "/domo/datastores/v1/collections";

function collUrl(collection: string): string {
  return COLLECTIONS + "/" + encodeURIComponent(collection);
}

function docsUrl(collection: string): string {
  return collUrl(collection) + "/documents/";
}

function docUrl(collection: string, docId: string): string {
  return collUrl(collection) + "/documents/" + encodeURIComponent(docId);
}

// ── Query aggregation options ────────────────────────────────────

/** Aggregation options for {@link query}. */
interface AppDbQueryOptions {
  /** Group by one or more content properties. */
  groupby?: string;
  /** Count aggregation alias. */
  count?: string;
  /** Average aggregation (e.g. "content.clicks avgClicks, content.impressions avgImps"). */
  avg?: string;
  /** Max aggregation. */
  max?: string;
  /** Min aggregation. */
  min?: string;
  /** Sum aggregation. */
  sum?: string;
  /** Unwind nested arrays. */
  unwind?: string;
  /** Order by aggregation alias (e.g. "sumClicks descending"). */
  orderby?: string;
  /** Limit number of returned documents (default 10000). */
  limit?: number;
  /** Offset for pagination (default 0). */
  offset?: number;
}

// ── Collection schema types ──────────────────────────────────────

interface AppDbColumnSchema {
  name: string;
  type: "STRING" | "LONG" | "DECIMAL" | "DOUBLE" | "DATE" | "DATETIME";
}

interface AppDbCollectionDef {
  name?: string;
  schema?: { columns: AppDbColumnSchema[] };
  syncEnabled?: boolean;
}

/**
 * Wrap a document body in `{ content: ... }` if the caller didn't already.
 * The AppDB API requires documents to have a `content` property.
 */
function wrapContent(doc: Record<string, any>): Record<string, any> {
  return doc.hasOwnProperty("content") ? doc : { content: doc };
}

// ── Document CRUD ────────────────────────────────────────────────

/**
 * List all documents in a collection.
 * @example
 * const docs = await domo.appdb.list("Users");
 */
function list<T = any>(collection: string, opts?: RequestOptions): Promise<T[]> {
  return transport.get<T[]>(docsUrl(collection), opts);
}

/**
 * Get a single document by ID.
 * @example
 * const doc = await domo.appdb.get("Users", "b3ea3d2d-...");
 */
function getDoc<T = any>(collection: string, docId: string, opts?: RequestOptions): Promise<T> {
  return transport.get<T>(docUrl(collection, docId), opts);
}

/**
 * Create a document. Auto-wraps in `{ content: ... }` if not already wrapped.
 * @example
 * await domo.appdb.create("Users", { username: "Bill" });
 * // Also accepts pre-wrapped: { content: { username: "Bill" } }
 */
function create<T = any>(collection: string, document: Record<string, any>, opts?: RequestOptions): Promise<T> {
  return transport.post<T>(docsUrl(collection), wrapContent(document), opts);
}

/**
 * Update a document by ID. Auto-wraps in `{ content: ... }` if not already wrapped.
 * @example
 * await domo.appdb.update("Users", docId, { username: "Ted" });
 */
function update<T = any>(collection: string, docId: string, document: Record<string, any>, opts?: RequestOptions): Promise<T> {
  return transport.put<T>(docUrl(collection, docId), wrapContent(document), opts);
}

/**
 * Delete a document by ID.
 * @example
 * await domo.appdb.remove("Users", docId);
 */
function remove<T = any>(collection: string, docId: string, opts?: RequestOptions): Promise<T> {
  return transport.delete<T>(docUrl(collection, docId), opts);
}

// ── Query ────────────────────────────────────────────────────────

/**
 * Query documents using MongoDB-style queries, with optional aggregations.
 *
 * @param collection - The collection name.
 * @param mongoQuery - A MongoDB query object (used in find()).
 * @param aggregations - Optional aggregation params (groupby, count, avg, sum, etc.).
 * @param opts - Optional request options.
 *
 * @example
 * // Simple query
 * const docs = await domo.appdb.query("Users", { "content.region": "West" });
 *
 * @example
 * // Query with aggregations
 * const results = await domo.appdb.query("campaigns", {}, {
 *   groupby: "content.campaignName, content.month",
 *   count: "documentCount",
 *   sum: "content.clicks sumClicks, content.impressions sumImps",
 *   orderby: "sumClicks descending",
 * });
 */
function query<T = any>(
  collection: string,
  mongoQuery: Record<string, any>,
  aggregations?: AppDbQueryOptions,
  opts?: RequestOptions,
): Promise<T[]> {
  let url = collUrl(collection) + "/documents/query";

  if (aggregations) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(aggregations)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += "?" + qs;
  }

  return transport.post<T[]>(url, mongoQuery, opts);
}

// ── Partial update ───────────────────────────────────────────────

/**
 * Partially update documents using MongoDB query + update operators.
 *
 * @param collection - The collection name.
 * @param mongoQuery - MongoDB query to match documents.
 * @param operation - MongoDB update operation ($set, $inc, $unset, etc.).
 * @param opts - Optional request options.
 * @returns Number of updated documents.
 *
 * @example
 * await domo.appdb.partialUpdate("Users",
 *   { "content.username": "Bill S. Preston, Esquire" },
 *   { "$set": { "content.comment": "Excellent!" } },
 * );
 */
function partialUpdate(
  collection: string,
  mongoQuery: Record<string, any>,
  operation: Record<string, any>,
  opts?: RequestOptions,
): Promise<number> {
  return transport.put<number>(
    collUrl(collection) + "/documents/update",
    { query: mongoQuery, operation },
    opts,
  );
}

// ── Bulk operations ──────────────────────────────────────────────

/**
 * Create multiple documents in a single request.
 * @returns `{ Created: number }`
 *
 * @example
 * await domo.appdb.bulkCreate("Users", [
 *   { username: "Bill" },
 *   { username: "Ted" },
 * ]);
 */
function bulkCreate<T = any>(
  collection: string,
  documents: Record<string, any>[],
  opts?: RequestOptions,
): Promise<T> {
  return transport.post<T>(collUrl(collection) + "/documents/bulk", documents.map(wrapContent), opts);
}

/**
 * Upsert multiple documents. Documents with an `id` are updated; those without are created.
 * @returns `{ Updated: number, Created: number }`
 *
 * @example
 * await domo.appdb.bulkUpsert("Users", [
 *   { id: "existing-id", username: "Bill", band: "Wyld Stallyns" },
 *   { username: "Rufus" },
 * ]);
 */
function bulkUpsert<T = any>(
  collection: string,
  documents: Record<string, any>[],
  opts?: RequestOptions,
): Promise<T> {
  const wrapped = documents.map(doc => {
    const { id, ...rest } = doc;
    const body = wrapContent(rest);
    if (id) body.id = id;
    return body;
  });
  return transport.put<T>(collUrl(collection) + "/documents/bulk", wrapped, opts);
}

/**
 * Delete multiple documents by ID.
 * @returns `{ Deleted: number }`
 *
 * @example
 * await domo.appdb.bulkDelete("Users", ["id-1", "id-2", "id-3"]);
 */
function bulkDelete<T = any>(
  collection: string,
  ids: string[],
  opts?: RequestOptions,
): Promise<T> {
  const url = collUrl(collection) + "/documents/bulk?ids=" + ids.map(encodeURIComponent).join(",");
  return transport.delete<T>(url, opts);
}

// ── Export ────────────────────────────────────────────────────────

/**
 * Manually trigger a sync/export of collections to Domo DataSets.
 *
 * @param includeRelated - If true, exports all collections wired to the app, not just those created by this instance.
 * @param opts - Optional request options.
 *
 * @example
 * await domo.appdb.export();
 * await domo.appdb.export(true); // include related collections
 */
function exportCollections(includeRelated = false, opts?: RequestOptions): Promise<any> {
  const url = "/domo/datastores/v1/export" + (includeRelated ? "?includeRelatedCollections=true" : "");
  return transport.post<any>(url, {}, opts);
}

// ── Collection management ────────────────────────────────────────

/**
 * List all collections for this app.
 * @example
 * const collections = await domo.appdb.listCollections();
 */
function listCollections<T = any>(opts?: RequestOptions): Promise<T[]> {
  return transport.get<T[]>(COLLECTIONS + "/", opts);
}

/**
 * Programmatically create a new collection.
 *
 * @example
 * await domo.appdb.createCollection({
 *   name: "Users",
 *   schema: { columns: [{ name: "username", type: "STRING" }] },
 *   syncEnabled: true,
 * });
 */
function createCollection<T = any>(definition: AppDbCollectionDef, opts?: RequestOptions): Promise<T> {
  return transport.post<T>(COLLECTIONS, definition, opts);
}

/**
 * Update a collection's definition (schema, sync settings).
 * Only update programmatically-created collections — manifest-defined ones revert on save.
 *
 * @example
 * await domo.appdb.updateCollection("Users", {
 *   schema: { columns: [{ name: "username", type: "STRING" }, { name: "band", type: "STRING" }] },
 *   syncEnabled: true,
 * });
 */
function updateCollection<T = any>(collection: string, definition: Record<string, any>, opts?: RequestOptions): Promise<T> {
  return transport.put<T>(collUrl(collection), definition, opts);
}

/**
 * Delete a collection. **Destructive and irreversible.**
 * @example
 * await domo.appdb.deleteCollection("TempData");
 */
function deleteCollection<T = any>(collection: string, opts?: RequestOptions): Promise<T> {
  return transport.delete<T>(collUrl(collection), opts);
}

/** AppDB namespace object exposed as `domo.appdb`. */
const appdb = {
  // Document CRUD
  list,
  get: getDoc,
  create,
  update,
  remove,
  // Query
  query,
  partialUpdate,
  // Bulk
  bulkCreate,
  bulkUpsert,
  bulkDelete,
  // Export
  export: exportCollections,
  // Collection management
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
};

export {
  appdb,
  list,
  getDoc,
  create,
  update,
  remove,
  query,
  partialUpdate,
  bulkCreate,
  bulkUpsert,
  bulkDelete,
  exportCollections,
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  AppDbQueryOptions,
  AppDbColumnSchema,
  AppDbCollectionDef,
};
