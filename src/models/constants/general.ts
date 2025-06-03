/**
 * The eventToListenerKey object maps event names to their corresponding listener
 * method names. This is used to route events received from the parent window
 * to the appropriate listener methods in the Domo class.
 */
export const eventToListenerMap: { [event: string]: string } = {
  dataUpdated: "onDataUpdated",
  filtersUpdated: "onFiltersUpdated",
  appData: "onAppDataUpdated",
  variablesUpdated: "onVariablesUpdated",
};

/**
 * Retrieves the current Ryuu session token from the global window object.
 *
 * @returns The session token as a string if available, otherwise undefined.
 */
export const getToken = (): string | undefined => (window as any)?.__RYUU_SID__;
