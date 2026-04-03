import { getQueryParams } from "../../utils/general";

/** Typed environment context available to Domo apps via query parameters. */
interface DomoEnv {
  /** The current user's numeric ID. */
  userId: string;
  /** The current user's display name. */
  userName: string;
  /** The current user's email address. */
  userEmail: string;
  /** The Domo customer/instance name. */
  customer: string;
  /** The user's locale (e.g. "en-US"). */
  locale: string;
  /** The platform: "desktop" or "mobile". */
  platform: "desktop" | "mobile";
  /** The current page ID. */
  pageId: string;
  /** Raw query parameters for any additional values. */
  [key: string]: string | undefined;
}

/**
 * Build a typed environment object from the iframe's query parameters.
 *
 * Domo injects context about the current user, instance, and page as query
 * params on the iframe URL. This function parses them into a typed object.
 *
 * @example
 * console.log(domo.env.userId);    // "481303514"
 * console.log(domo.env.userName);  // "JSON"
 * console.log(domo.env.platform);  // "desktop"
 * console.log(domo.env.locale);    // "en-US"
 */
function buildEnv(): DomoEnv {
  const params = getQueryParams();
  return {
    userId: String(params.userId ?? ""),
    userName: String(params.userName ?? ""),
    userEmail: String(params.userEmail ?? ""),
    customer: String(params.customer ?? ""),
    locale: String(params.locale ?? ""),
    platform: (params.platform as "desktop" | "mobile") ?? "desktop",
    pageId: String(params.pageId ?? ""),
    ...params,
  } as DomoEnv;
}

export { buildEnv, DomoEnv };
