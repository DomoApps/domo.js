/**
 * Global type declarations for mobile environment variables and interfaces
 * provided by Flutter/native mobile applications and WebKit
 */
declare global {
  /**
   * Global variable provided by Flutter in mobile environments
   * for handling variable-related communications.
   * This variable will be injected by Flutter when running in a mobile app context.
   */
  var domovariable: {
    postMessage: (message: string) => void;
  } | undefined;

  var domofilter: {
    postMessage: (message: string) => void;
  } | undefined;

  /**
   * Extended Window interface to include WebKit message handlers
   * used for iOS mobile app communication
   */
  interface Window {
    webkit?: {
      messageHandlers?: {
        /**
         * Message handler for filter-related communications in iOS
         */
        domofilter?: {
          postMessage?: (message: any) => void;
        };
        /**
         * Message handler for variable-related communications in iOS
         */
        domovariable?: {
          postMessage: (message: any) => void;
        };
      };
    };
  }
}

export {};