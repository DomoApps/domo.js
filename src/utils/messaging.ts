import { isIOS, isMobile } from "./general";
import { domoDebug } from "./debug";

type BridgeName = 'domofilter' | 'domovariable';

/**
 * Sends a message to the parent window, with mobile bridge fallback cascade:
 *   1. Native bridge (domofilter/domovariable global)
 *   2. WebKit messageHandler (iOS)
 *   3. window.parent.postMessage (fallback)
 *
 * On desktop, always uses window.parent.postMessage directly.
 */
export function sendToParent(
  event: string,
  desktopPayload: object,
  bridgeName?: BridgeName,
  nativeBridgePayload?: string,
  webkitPayload?: any
): void {
  if (!isMobile() || !bridgeName) {
    domoDebug.log('messages', 'sent:postMessage', event, desktopPayload);
    window.parent.postMessage(JSON.stringify(desktopPayload), '*');
    return;
  }

  const ios = isIOS();
  const bridge = bridgeName === 'domofilter' ? domofilter : domovariable;

  try {
    domoDebug.log('messages', 'sent:mobile', event, { via: bridgeName, payload: nativeBridgePayload });
    bridge!.postMessage(nativeBridgePayload!);
  } catch (error) {
    console.error(`Failed to post message using ${bridgeName}:`, error);
    try {
      if (ios) {
        domoDebug.log('messages', 'sent:mobile', event, { via: 'webkit', payload: webkitPayload });
        window.webkit?.messageHandlers?.[bridgeName]?.postMessage?.(webkitPayload);
      } else {
        domoDebug.log('messages', 'sent:postMessage', event, desktopPayload);
        window.parent.postMessage(JSON.stringify(desktopPayload), '*');
      }
    } catch (fallbackError) {
      console.error("Failed to post message using webkit:", fallbackError);
      domoDebug.log('messages', 'sent:postMessage', event, desktopPayload);
      window.parent.postMessage(JSON.stringify(desktopPayload), '*');
    }
  }
}
