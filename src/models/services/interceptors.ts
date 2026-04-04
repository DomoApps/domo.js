export interface InterceptorConfig {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: any;
}

export type NextFn = (config: InterceptorConfig) => Promise<Response>;
export type InterceptorFn = (config: InterceptorConfig, next: NextFn) => Promise<Response>;

const interceptors: InterceptorFn[] = [];

/**
 * Register a request interceptor. Interceptors wrap the fetch call in an onion model:
 * the last registered interceptor runs outermost.
 *
 * @param fn - Interceptor function receiving (config, next). Call `next(config)` to proceed.
 * @returns A function to remove this interceptor.
 *
 * @example
 * const remove = Domo.intercept((config, next) => {
 *   console.log('Request:', config.method, config.url);
 *   return next(config);
 * });
 */
export function addInterceptor(fn: InterceptorFn): () => void {
  interceptors.push(fn);
  return () => {
    const idx = interceptors.indexOf(fn);
    if (idx >= 0) interceptors.splice(idx, 1);
  };
}

/**
 * Build a chain that runs all interceptors around a final fetch call.
 */
export function buildInterceptorChain(
  finalFetch: (config: InterceptorConfig) => Promise<Response>
): (config: InterceptorConfig) => Promise<Response> {
  return (config: InterceptorConfig) => {
    let index = interceptors.length - 1;
    const next = (cfg: InterceptorConfig): Promise<Response> => {
      if (index < 0) return finalFetch(cfg);
      const fn = interceptors[index--];
      return fn(cfg, next);
    };
    return next(config);
  };
}

export function getInterceptors(): readonly InterceptorFn[] {
  return interceptors;
}

export function clearInterceptors(): void {
  interceptors.length = 0;
}
