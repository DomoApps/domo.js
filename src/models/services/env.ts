import { getQueryParams } from "../../utils/general";
import { getToken } from "../constants/general";

/** Typed environment context available to Domo apps. */
interface DomoEnv {
  /** The current user's numeric ID. */
  userId: string;
  /** The current user's display name. */
  userName: string;
  /** The current user's email address. */
  userEmail: string;
  /** The Domo customer/instance name. */
  customer: string;
  /** The Domo host (e.g. "company.domo.com"). Only available after the environment API resolves. */
  host: string;
  /** The user's locale (e.g. "en-US"). */
  locale: string;
  /** The platform: "desktop" or "mobile". */
  platform: "desktop" | "mobile";
  /** The current page ID (from query params). */
  pageId: string;
  /** Whether the environment API has been loaded. */
  loaded: boolean;
  /** Raw query parameters for any additional values. */
  [key: string]: string | boolean | undefined;
}

/**
 * Build a typed environment object.
 *
 * Immediately populates from iframe query parameters, then fetches
 * `GET /domo/environment/v1` in the background to enrich with
 * server-side values (host, authoritative userId/email, etc.).
 * The returned object is mutated in place when the fetch resolves.
 *
 * @example
 * // Available immediately (from query params):
 * console.log(domo.env.userId);    // "481303514"
 * console.log(domo.env.userName);  // "JSON"
 * console.log(domo.env.platform);  // "desktop"
 *
 * // Available after the environment API loads:
 * console.log(domo.env.host);      // "domo.demo.domo.com"
 */
function buildEnv(): DomoEnv {
  const params = getQueryParams();

  const env: DomoEnv = {
    userId: String(params.userId ?? ""),
    userName: String(params.userName ?? ""),
    userEmail: String(params.userEmail ?? ""),
    customer: String(params.customer ?? ""),
    host: "",
    locale: String(params.locale ?? ""),
    platform: params.platform === "mobile" ? "mobile" : "desktop",
    pageId: String(params.pageId ?? ""),
    loaded: false,
  };

  // Copy any extra query params
  for (const key of Object.keys(params)) {
    if (!(key in env)) {
      env[key] = String(params[key] ?? "");
    }
  }

  // Enrich from the environment API in the background
  fetchEnv(env);

  return env;
}

async function fetchEnv(env: DomoEnv): Promise<void> {
  try {
    const token = getToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["X-DOMO-Ryuu-Session"] = token;

    const response = await fetch("/domo/environment/v1", { headers });
    if (!response.ok) return;

    const data = await response.json();

    // Merge server values — server is authoritative, overwrite query params
    if (data.userId != null) env.userId = String(data.userId);
    if (data.userName) env.userName = data.userName;
    if (data.userEmail) env.userEmail = data.userEmail;
    if (data.customer) env.customer = data.customer;
    if (data.host) env.host = data.host;
    if (data.locale) env.locale = data.locale;

    env.loaded = true;
  } catch {
    // Silently fail — query params are the fallback
  }
}

export { buildEnv, DomoEnv };
