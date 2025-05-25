export interface QueryParams {
  userId?: string | number;
  userName?: string;
  userEmail?: string;
  customer?: string;
  locale?: string;
  environment?: string;
  platform?: 'desktop' | 'mobile';
  [key: string]: string | number | undefined;
}
