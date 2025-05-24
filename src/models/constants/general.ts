/**
 * Retrieves the current Ryuu session token from the global window object.
 *
 * @returns The session token as a string if available, otherwise undefined.
 */
export const getToken = (): string | undefined => 
    (window as any)?.__RYUU_SID__;