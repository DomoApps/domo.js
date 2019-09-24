import { RequestOptions, QueryParams } from './models';
export = domo;
declare class domo {
    static post(url: string, body?: any, options?: RequestOptions): Promise<any>;
    static put(url: string, body?: any, options?: RequestOptions): Promise<any>;
    static get(url: string, options?: RequestOptions): Promise<any>;
    static delete(url: string, options?: RequestOptions): Promise<any>;
    static getAll(urls: string[], options?: RequestOptions): Promise<any[]>;
    /**
     * Let the domoapp optionally handle its own data updates.
     */
    static onDataUpdate(cb: (alias: string) => void): void;
    /**
     * Request a navigation change
     */
    static navigate(url: string, isNewWindow: boolean): void;
    /**
     * Post a filter to the parent page/dashboard
     * @param {String} column
     * @param {String} operator
     * @param {Array} values
     */
    static filterContainer(column: string, operator: string, values: any, dataType: any): void;
    static env: QueryParams;
    static __util: {
        isVerifiedOrigin: typeof isVerifiedOrigin;
        getQueryParams: typeof getQueryParams;
        setFormatHeaders: typeof setFormatHeaders;
        isSuccess: typeof isSuccess;
    };
}
declare function isSuccess(status: number): boolean;
declare function isVerifiedOrigin(origin: string): boolean;
declare function getQueryParams(): QueryParams;
declare function setFormatHeaders(req: XMLHttpRequest, url: string, options?: RequestOptions): void;
