/**
 * Query parameters for Domo requests.
 *
 * If you know all possible query params, add them here. Otherwise, use the index signature for flexibility.
 */
export interface QueryParams {
  userId?: string | number;
  userName?: string;
  userEmail?: string;
  customer?: string;
  locale?: string;
  environment?: string;
  platform?: 'desktop' | 'mobile';
  // ...add more known params as needed
  [key: string]: string | number | undefined;
}
