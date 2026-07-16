import { transport } from "../../transport";
import { RequestOptions, DomoDataFormats } from "../interfaces/request";

/** Options for querying a dataset via the Data API. */
interface DataQueryOptions {
  // ── Column selection ──
  /** Limit the result set to specific field aliases. */
  fields?: string[];

  // ── Filtering ──
  /** Filter expression (e.g. "amount > 1000, name contains 'Foo'"). */
  filter?: string;

  // ── Aggregations ──
  /** Fields to average. */
  avg?: string[];
  /** Fields to count. */
  count?: string[];
  /** Fields to get the max of. */
  max?: string[];
  /** Fields to get the min of. */
  min?: string[];
  /** Fields to sum. */
  sum?: string[];
  /** Fields to get unique values of. */
  unique?: string[];

  // ── Grouping ──
  /** Group by one or more fields. */
  groupBy?: string[];
  /** Date grain: e.g. "dateField by month". */
  dateGrain?: string;
  /** Calendar type for date operations. */
  calendar?: "fiscal" | "standard";

  // ── Ordering & pagination ──
  /** Order by clause (e.g. "amount descending" or "name, amount descending"). */
  orderBy?: string;
  /** Maximum number of rows to return. */
  limit?: number;
  /** Row offset for pagination. */
  offset?: number;

  // ── Beast Modes ──
  /** Enable beast mode columns in the query. */
  useBeastMode?: boolean;

  // ── Page filter bypass ──
  /** When true, bypasses page-level filters applied by the host. */
  ignorePageFilters?: boolean;

  // ── Response format ──
  /** Response format. Defaults to 'array-of-objects'. */
  format?: DomoDataFormats;
  /** Additional request options (custom fetch, etc.). */
  requestOptions?: RequestOptions;
}

/**
 * Query a dataset by its manifest alias using the Data API.
 *
 * Supports all Data API query operators: fields, filter, aggregations
 * (avg, count, max, min, sum, unique), groupBy, dateGrain, calendar,
 * orderBy, limit, offset, and useBeastMode.
 *
 * @param alias - The dataset alias from manifest.json datasetsMapping.
 * @param opts - Query options.
 * @returns The query results.
 *
 * @example
 * const rows = await domo.data.query("sales");
 *
 * @example
 * const rows = await domo.data.query("sales", {
 *   fields: ["amount", "name"],
 *   filter: "amount > 100",
 *   orderBy: "amount descending",
 *   limit: 50,
 * });
 *
 * @example
 * // Aggregation with groupby:
 * const totals = await domo.data.query("sales", {
 *   fields: ["region", "amount"],
 *   sum: ["amount"],
 *   groupBy: ["region"],
 * });
 *
 * @example
 * // Date graining:
 * const monthly = await domo.data.query("sales", {
 *   dateGrain: "orderDate by month",
 *   sum: ["amount"],
 * });
 *
 * @example
 * // Beast modes:
 * const bm = await domo.data.query("sales", {
 *   useBeastMode: true,
 *   fields: ["myBeastMode", "reps"],
 *   sum: ["myBeastMode"],
 *   groupBy: ["reps"],
 * });
 *
 * @example
 * // CSV format:
 * const csv = await domo.data.query("sales", { format: "csv" });
 */
function query<T = any>(
  alias: string,
  opts?: DataQueryOptions,
): Promise<T> {
  const params = new URLSearchParams();

  // Column selection
  if (opts?.fields?.length) params.set("fields", opts.fields.join(","));

  // Filtering
  if (opts?.filter) params.set("filter", opts.filter);

  // Aggregations
  if (opts?.avg?.length) params.set("avg", opts.avg.join(","));
  if (opts?.count?.length) params.set("count", opts.count.join(","));
  if (opts?.max?.length) params.set("max", opts.max.join(","));
  if (opts?.min?.length) params.set("min", opts.min.join(","));
  if (opts?.sum?.length) params.set("sum", opts.sum.join(","));
  if (opts?.unique?.length) params.set("unique", opts.unique.join(","));

  // Grouping
  if (opts?.groupBy?.length) params.set("groupby", opts.groupBy.join(","));
  if (opts?.dateGrain) params.set("dategrain", opts.dateGrain);
  if (opts?.calendar) params.set("calendar", opts.calendar);

  // Ordering & pagination
  if (opts?.orderBy) params.set("orderby", opts.orderBy);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.offset !== undefined) params.set("offset", String(opts.offset));

  // Beast modes
  if (opts?.useBeastMode) params.set("useBeastMode", "true");

  // Page filter bypass
  if (opts?.ignorePageFilters) params.set("ignorePageFilters", "true");

  const qs = params.toString();
  const base = "/data/v1/" + encodeURIComponent(alias);
  const url = qs ? base + "?" + qs : base;

  const requestOptions: RequestOptions = {
    ...opts?.requestOptions,
  };
  if (opts?.format) requestOptions.format = opts.format;

  return transport.get<T>(url, requestOptions);
}

/**
 * Execute a SQL query against a dataset.
 *
 * Uses POST to `/sql/v1/{alias}` with the SQL string as the request body.
 * Does not support page filters.
 *
 * @param alias - The dataset alias from manifest.json.
 * @param sqlQuery - The SQL query string.
 * @param opts - Optional request options.
 * @returns The query results.
 *
 * @example
 * const rows = await domo.data.sql("sales", "SELECT * FROM sales LIMIT 100");
 *
 * @example
 * const totals = await domo.data.sql("sales",
 *   "SELECT region, SUM(amount) as total FROM sales GROUP BY region"
 * );
 */
function sql<T = any>(
  alias: string,
  sqlQuery: string,
  opts?: RequestOptions,
): Promise<T> {
  const requestOptions: RequestOptions = {
    ...opts,
    contentType: "text/plain",
  };
  return transport.post<T>(
    "/sql/v1/" + encodeURIComponent(alias),
    sqlQuery as any,
    requestOptions,
  );
}

/** Data namespace object exposed as `domo.data`. */
const data = {
  query,
  sql,
};

export {
  data,
  query,
  sql,
  DataQueryOptions,
};
